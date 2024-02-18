const ethers = require("ethers");
const { TokenId, AccountId } = require("@hashgraph/sdk");

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

  if (!data.account) {
    throw new Error("account not found");
  }

  if (data.tokens.length < 2) {
    throw new Error("Insufficient tokens in path");
  }

  if (data.fees.length !== data.tokens.length - 1) {
    throw new Error(
      "Number of fees does not align with number of tokens in path"
    );
  }

  if (!data.inputAmount) {
    throw new Error("inputAmount not found");
  }

  const { inputAmount, tokens, fees, account } = data;

  return {
    recipientAccount: account,
    recipientAddress: AccountId.fromString(account).toSolidityAddress(),
    inputAmount,
    path: {
      tokens,
      fees,
    },
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

const createPathHexData = function (path) {
  let pathHexData = "";
  for (let i = 0; i < path.tokens.length; i++) {
    const token = TokenId.fromString(path.tokens[i]);
    pathHexData += token.toSolidityAddress();
    if (i < path.fees.length) {
      const feeHexStr = feeToHexString(path.fees[i]).slice(2);
      pathHexData += feeHexStr;
    }
  }
  return pathHexData;
};

module.exports = {
  checkAndFormatData,
  feeToHexString,
  hexStringToUint8Array,
  createPathHexData,
};
