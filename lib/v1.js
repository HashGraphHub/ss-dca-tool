const {
  TokenId,
  ContractId,
  ContractFunctionParameters,
  ContractExecuteTransaction,
  Hbar,
  HbarUnit,
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

  const route = path.tokens.map(
    (token) => "0x" + TokenId.fromString(token).toSolidityAddress()
  );
  console.log("Creating path data...");
  const quoteExactInputFcnData = abiInterfaces.encodeFunctionData(
    "getAmountsOut",
    [inputAmount.toString(), route]
  );
  // execute quote function
  console.log("Executing quote function...");
  const quoteResult = await provider.call({
    to: `0x${ContractId.fromString(config.v1swapRouter).toSolidityAddress()}`,
    data: quoteExactInputFcnData,
  });
  const { amounts } = abiInterfaces.decodeFunctionResult(
    "getAmountsOut",
    quoteResult
  );
  const outputAmount = Number(amounts[amounts.length - 1]);

  console.log("Final output amount: ", outputAmount);

  // ____    _____      ___   ___   _____ ___  _  _____ _  _ ___
  // |__ /   / __\ \    / /_\ | _ \ |_   _/ _ \| |/ / __| \| / __|
  //  |_ \_  \__ \\ \/\/ / _ \|  _/   | || (_) | ' <| _|| .` \__ \
  // |___(_) |___/ \_/\_/_/ \_\_|     |_| \___/|_|\_\___|_|\_|___/

  // for hbar -> hts
  console.log("Creating swap data...");
  const params = new ContractFunctionParameters();
  // add input amount as first param if input token is not hbar
  if (inputToken !== config.whbarId) params.addUint256(inputAmount); //uint amountInparam
  params
    .addUint256(Math.floor(outputAmount * 0.99)) //uint amountOutMin
    .addAddressArray(route) //address[] calldata path
    .addAddress(recipientAddress) //address to
    .addUint256(Math.floor((new Date().getTime() + 10_000) / 1000)); //uint deadline

  console.log("Executing swap function...");
  const tx = new ContractExecuteTransaction();
  // set hbar amount if input token is hbar
  if (inputToken === config.whbarId)
    tx.setPayableAmount(new Hbar(inputAmount, HbarUnit.Tinybar)); // hbar amount

  let functionName = "";
  if (inputToken === config.whbarId) {
    functionName = "swapExactETHForTokens";
  } else if (outputToken === config.whbarId) {
    functionName = "swapExactTokensForETH";
  } else {
    functionName = "swapExactTokensForTokens";
  }

  const response = await tx
    .setContractId(config.v1swapRouter)
    .setGas(1_000_000)
    .setFunction(functionName, params)
    .execute(client);

  // for hts -> hts

  const record = await response.getRecord(client);
  const result = record.contractFunctionResult;
  const values = result.getResult(["uint[]"]);
  const amountReceived = values[0]; //uint[] amounts
  const finalOutputAmount = amountReceived[amountReceived.length - 1];
  console.log("Final output amount: ", finalOutputAmount.toString());
};
