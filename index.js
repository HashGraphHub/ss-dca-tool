require("dotenv").config();
const functions = require("@google-cloud/functions-framework");
const {
  ContractId,
  ContractExecuteTransaction,
  Client,
  HbarUnit,
  Hbar,
  AccountAllowanceApproveTransaction,
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
  const { recipientAddress, inputToken, inputAmount, outputToken, feeHexStr } =
    checkAndFormatData(cloudEvent);
  // create client
  const client =
    config.network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(process.env.ACCOUNT_ID, process.env.PRIVATE_KEY);

  // instatiate abi interface
  const abiInterfaces = new ethers.Interface(abi);

  // 1. APPROVE TOKEN SPEND
  // if token is non-hbar it needs approving
  if (inputToken.toString() !== config.whbarId) {
    console.log("Non-HBAR token, approving spend...");
    const approveTx =
      new AccountAllowanceApproveTransaction().approveTokenAllowance(
        inputToken,
        process.env.ACCOUNT_ID,
        config.swapRouter,
        inputAmount
      );
    await approveTx.execute(client);
  }

  // 2. GET QUOTE FOR TOKEN SWAP
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

  // 3. Swap tokens
  console.log("Creating swap data...");
  const params = {
    path: "0x" + pathHexData,
    recipient: recipientAddress,
    deadline: Math.floor((new Date().getTime() + 10_000) / 1000), // REDUCE TIME
    amountIn: inputAmount,
    amountOutMinimum: Math.floor(finalOutputAmount.toString() * 0.99), // REDUCE SLIPPAGE // HANDLE CORRECTLY - THIS IS BIG INT
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
