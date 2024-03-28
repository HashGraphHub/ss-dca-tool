const {
  ContractId,
  ContractExecuteTransaction,
  Client,
  HbarUnit,
  Hbar,
} = require("@hashgraph/sdk");
const ethers = require("ethers");
const config = require("./config");
const { abi } = require("./constants");
const { hexStringToUint8Array, createPathHexData } = require("./utils");

module.exports = async (client, recipientAddress, inputAmount, path) => {
  const inputToken = path.tokens[0];
  const outputToken = path.tokens[path.tokens.length - 1];

  // instatiate abi interface
  const abiInterfaces = new ethers.Interface(abi);

  // ___      ___ ___ _____    ___  _   _  ___ _____ ___   ___ ___  ___   _____ ___  _  _____ _  _   _____      ___   ___
  // |_  )    / __| __|_   _|  / _ \| | | |/ _ \_   _| __| | __/ _ \| _ \ |_   _/ _ \| |/ / __| \| | / __\ \    / /_\ | _ \
  //  / / _  | (_ | _|  | |   | (_) | |_| | (_) || | | _|  | _| (_) |   /   | || (_) | ' <| _|| .` | \__ \\ \/\/ / _ \|  _/
  // /___(_)  \___|___| |_|    \__\_\\___/ \___/ |_| |___| |_| \___/|_|_\   |_| \___/|_|\_\___|_|\_| |___/ \_/\_/_/ \_\_|

  const provider = new ethers.JsonRpcProvider(config.jsonRpcUrl, "", {
    batchMaxCount: 1, //workaround for V6
  });

  // create path data
  console.log("Creating path data...");
  // create path hex data with any token route
  const pathHexData = createPathHexData(path);
  const encodedPathData = hexStringToUint8Array(pathHexData);
  const quoteExactInputFcnData = abiInterfaces.encodeFunctionData(
    "quoteExactInput",
    [encodedPathData, inputAmount.toString()]
  );
  // execute quote function
  console.log("Executing quote function...");
  const result = await provider.call({
    to: `0x${ContractId.fromString(config.v2quoter).toSolidityAddress()}`,
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
      outputToken === config.whbarId // if output token is whbar, send to router to unwrap
        ? ContractId.fromString(config.v2swapRouter).toSolidityAddress()
        : recipientAddress,
    deadline: Math.floor((new Date().getTime() + 10_000) / 1000),
    amountIn: inputAmount,
    amountOutMinimum: Math.floor(finalOutputAmount.toString() * 0.99),
  };

  //encode each function individually
  const swapEncoded = abiInterfaces.encodeFunctionData("exactInput", [params]);
  const refundHbarOrUnwrapHbar =
    outputToken === config.whbarId
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
    .setContractId(config.v2swapRouter)
    .setGas(1_000_000) // REDUCE GAS
    .setFunctionParameters(buyTokenFcnDataAsUint8Array);

  if (inputToken === config.whbarId)
    buyTokenTransaction.setPayableAmount(
      Hbar.from(inputAmount, HbarUnit.Tinybar)
    );

  const buyTokenResponse = await buyTokenTransaction.execute(client);
  const buyTokenRecord = await buyTokenResponse.getRecord(client);
  const buyTokenResult = buyTokenRecord.contractFunctionResult;
  const buyTokenValues = buyTokenResult.getResult(["uint256"]);
  const amountOut = buyTokenValues[0]; //uint256 amountOut

  console.log("Amount out: ", amountOut.toString());
};
