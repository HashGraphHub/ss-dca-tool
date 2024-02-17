require("dotenv").config();
const functions = require("@google-cloud/functions-framework");
const {
  ContractId,
  ContractExecuteTransaction,
  Client,
  HbarUnit,
  Hbar,
  AccountAllowanceApproveTransaction,
  TransferTransaction,
} = require("@hashgraph/sdk");
const ethers = require("ethers");
const config = require("./lib/config");
const { abi } = require("./lib/constants");
const { checkAndFormatData, hexStringToUint8Array } = require("./lib/utils");

functions.cloudEvent("buyToken", async (cloudEvent) => {
  console.log("Starting buy token function");
  console.log("Client account id: ", process.env.ACCOUNT_ID);
  console.log("Network: ", config.network);
  // handle data errors in the cloud event and deconstruct
  const {
    recipientAccount,
    recipientAddress,
    inputToken,
    inputAmount,
    outputToken,
    feeHexStr,
  } = checkAndFormatData(cloudEvent);
  // create client
  const client =
    config.network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(process.env.ACCOUNT_ID, process.env.PRIVATE_KEY);

  // instatiate abi interface
  const abiInterfaces = new ethers.Interface(abi);

  // _       _   ___ ___ ___  _____   _____   _____ ___  _  _____ _  _   ___ ___ ___ _  _ ___
  // / |     /_\ | _ \ _ \ _ \/ _ \ \ / / __| |_   _/ _ \| |/ / __| \| | / __| _ \ __| \| |   \
  // | |_   / _ \|  _/  _/   / (_) \ V /| _|    | || (_) | ' <| _|| .` | \__ \  _/ _|| .` | |) |
  // |_(_) /_/ \_\_| |_| |_|_\\___/ \_/ |___|   |_| \___/|_|\_\___|_|\_| |___/_| |___|_|\_|___/

  // if recepientAccount is not the same as the operator account, we need to pay operator
  // operator should have spend allowance for the input token
  if (recipientAccount !== process.env.ACCOUNT_ID) {
    console.log(
      "Recipient account is not operator account, transferring to client..."
    );
    let transferTx = new TransferTransaction();
    if (inputToken.toString() === config.whbarId) {
      // if input token is hbar
      transferTx
        .addHbarTransfer(
          client.operatorAccountId,
          new Hbar(inputAmount, HbarUnit.Tinybar)
        )
        .addHbarTransfer(
          recipientAccount,
          new Hbar(-inputAmount, HbarUnit.Tinybar)
        );
    } else {
      // if input token is non-hbar
      transferTx
        .addApprovedTokenTransfer(
          inputToken,
          client.operatorAccountId,
          inputAmount
        )
        .addApprovedTokenTransfer(inputToken, recipientAccount, -inputAmount);
    }
    await transferTx.execute(client);
  }

  // if token is non-hbar it needs approving
  if (inputToken.toString() !== config.whbarId) {
    console.log("Non-HBAR token, approving spend...");
    const approveTx =
      new AccountAllowanceApproveTransaction().approveTokenAllowance(
        inputToken,
        client.operatorAccountId,
        config.swapRouter,
        inputAmount
      );
    try {
      await approveTx.execute(client);
    } catch (err) {
      console.error("Error approving spend: ", err);
      return { ok: false };
    }
  }

  // ___      ___ ___ _____    ___  _   _  ___ _____ ___   ___ ___  ___   _____ ___  _  _____ _  _   _____      ___   ___
  // |_  )    / __| __|_   _|  / _ \| | | |/ _ \_   _| __| | __/ _ \| _ \ |_   _/ _ \| |/ / __| \| | / __\ \    / /_\ | _ \
  //  / / _  | (_ | _|  | |   | (_) | |_| | (_) || | | _|  | _| (_) |   /   | || (_) | ' <| _|| .` | \__ \\ \/\/ / _ \|  _/
  // /___(_)  \___|___| |_|    \__\_\\___/ \___/ |_| |___| |_| \___/|_|_\   |_| \___/|_|\_\___|_|\_| |___/ \_/\_/_/ \_\_|

  const provider = new ethers.JsonRpcProvider(config.jsonRpcUrl, "", {
    batchMaxCount: 1, //workaround for V6
  });

  // create path data
  console.log("Creating path data...");
  const pathHexData =
    inputToken.toSolidityAddress() +
    feeHexStr.slice(2) +
    outputToken.toSolidityAddress();
  const encodedPathData = hexStringToUint8Array(pathHexData);
  const quoteExactInputFcnData = abiInterfaces.encodeFunctionData(
    "quoteExactInput",
    [encodedPathData, inputAmount.toString()]
  );
  // execute quote function
  console.log("Executing quote function...");
  const result = await provider.call({
    to: `0x${ContractId.fromString(config.quoter).toSolidityAddress()}`,
    data: quoteExactInputFcnData,
  });
  const decoded = abiInterfaces.decodeFunctionResult("quoteExactInput", result);
  const finalOutputAmount = decoded.amountOut;

  console.log("Final output amount: ", finalOutputAmount.toString());

  // ____    _____      ___   ___   _____ ___  _  _____ _  _ ___
  // |__ /   / __\ \    / /_\ | _ \ |_   _/ _ \| |/ / __| \| / __|
  //  |_ \_  \__ \\ \/\/ / _ \|  _/   | || (_) | ' <| _|| .` \__ \
  // |___(_) |___/ \_/\_/_/ \_\_|     |_| \___/|_|\_\___|_|\_|___/

  console.log("Creating swap data...");
  const params = {
    path: "0x" + pathHexData,
    recipient:
      outputToken.toString() === config.whbarId // if output token is whbar, send to router to unwrap
        ? ContractId.fromString(config.swapRouter).toSolidityAddress()
        : recipientAddress,
    deadline: Math.floor((new Date().getTime() + 10_000) / 1000),
    amountIn: inputAmount,
    amountOutMinimum: Math.floor(finalOutputAmount.toString() * 0.99),
  };

  //encode each function individually
  const swapEncoded = abiInterfaces.encodeFunctionData("exactInput", [params]);
  const refundHbarOrUnwrapHbar =
    outputToken.toString() === config.whbarId
      ? abiInterfaces.encodeFunctionData("unwrapWHBAR", [0, recipientAddress])
      : abiInterfaces.encodeFunctionData("refundETH");
  //multi-call parameter: bytes[]
  const multiCallParam = [swapEncoded, refundHbarOrUnwrapHbar];

  //get encoded data for the multicall involving both functions
  const buyTokenFcnData = abiInterfaces.encodeFunctionData("multicall", [
    multiCallParam,
  ]);
  //get encoded data as Uint8Array
  const buyTokenFcnDataAsUint8Array = hexStringToUint8Array(
    buyTokenFcnData.slice(2) // remove 0x
  );

  console.log("Executing swap function...");
  const buyTokenTransaction = new ContractExecuteTransaction()
    .setContractId(config.swapRouter)
    .setGas(1_000_000) // REDUCE GAS
    .setFunctionParameters(buyTokenFcnDataAsUint8Array);

  if (inputToken.toString() === config.whbarId)
    buyTokenTransaction.setPayableAmount(
      Hbar.from(inputAmount, HbarUnit.Tinybar)
    );

  const buyTokenResponse = await buyTokenTransaction.execute(client);
  const buyTokenRecord = await buyTokenResponse.getRecord(client);
  const buyTokenResult = buyTokenRecord.contractFunctionResult;
  const buyTokenValues = buyTokenResult.getResult(["uint256"]);
  const amountOut = buyTokenValues[0]; //uint256 amountOut

  console.log("Amount out: ", amountOut.toString());
});
