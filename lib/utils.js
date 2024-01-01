const ethers = require("ethers");
const { TokenId } = require("@hashgraph/sdk");

const checkAndFormatData = function (cloudEvent) {
  if (!process.env.ACCOUNT_ID) {
    throw new Error("ACCOUNT_ID not found");
  }
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY not found");
  }

  const json = Buffer.from(cloudEvent.data.message.data, "base64").toString();
  const data = JSON.parse(json);

  console.log("Data: ", data);

  if (!data.inputToken) {
    throw new Error("inputToken not found");
  }
  if (!data.outputToken) {
    throw new Error("outputToken not found");
  }
  if (!data.inputAmount) {
    throw new Error("inputAmount not found");
  }
  if (!data.fee) {
    throw new Error("fee not found");
  }
  const { inputToken, inputAmount, outputToken, fee } = data;

  return {
    recipientAddress: TokenId.fromString(
      process.env.ACCOUNT_ID
    ).toSolidityAddress(),
    inputToken: TokenId.fromString(inputToken),
    inputAmount,
    outputToken: TokenId.fromString(outputToken),
    feeHexStr: feeToHexString(fee),
  };
};

const feeToHexString = function (fee) {
  let feeBigNumber = BigInt(fee);
  let hex = ethers.toBeHex(feeBigNumber, 3);
  return hex;
};

const hexStringToUint8Array = function (hexString) {
  if (hexString.length % 2 !== 0) {
    throw "Invalid hexString";
  } /*from  w w w.  j  av a 2s  . c  o  m*/
  var arrayBuffer = new Uint8Array(hexString.length / 2);

  for (var i = 0; i < hexString.length; i += 2) {
    var byteValue = parseInt(hexString.substr(i, 2), 16);
    if (isNaN(byteValue)) {
      throw "Invalid hexString";
    }
    arrayBuffer[i / 2] = byteValue;
  }

  return arrayBuffer;
};

module.exports = {
  checkAndFormatData,
  feeToHexString,
  hexStringToUint8Array,
};
