require("dotenv").config();
const functions = require("@google-cloud/functions-framework");
const config = require("./lib/config");
const { checkAndFormatData } = require("./lib/utils");
const {
  HbarUnit,
  Hbar,
  TransferTransaction,
  AccountAllowanceApproveTransaction,
  Client,
} = require("@hashgraph/sdk");
const handleV1Swap = require("./lib/v1");
const handleV2Swap = require("./lib/v2");

functions.cloudEvent("buyToken", async (cloudEvent) => {
  console.log("Starting buy token function");
  console.log("Client account id: ", process.env.ACCOUNT_ID);
  console.log("Network: ", config.network);
  // handle data errors in the cloud event and deconstruct
  const { version, recipientAccount, recipientAddress, inputAmount, path } =
    checkAndFormatData(cloudEvent);

  // create client
  const client =
    config.network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(process.env.ACCOUNT_ID, process.env.PRIVATE_KEY);

  // _       _   ___ ___ ___  _____   _____   _____ ___  _  _____ _  _   ___ ___ ___ _  _ ___
  // / |     /_\ | _ \ _ \ _ \/ _ \ \ / / __| |_   _/ _ \| |/ / __| \| | / __| _ \ __| \| |   \
  // | |_   / _ \|  _/  _/   / (_) \ V /| _|    | || (_) | ' <| _|| .` | \__ \  _/ _|| .` | |) |
  // |_(_) /_/ \_\_| |_| |_|_\\___/ \_/ |___|   |_| \___/|_|\_\___|_|\_| |___/_| |___|_|\_|___/
  // if recepientAccount is not the same as the operator account, we need to pay operator
  // operator should have spend allowance for the input token
  const inputToken = path.tokens[0];
  if (recipientAccount !== process.env.ACCOUNT_ID) {
    console.log(
      "Recipient account is not operator account, transferring to client..."
    );
    let transferTx = new TransferTransaction();
    if (inputToken === config.whbarId) {
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
    try {
      const submittedTx = await transferTx.execute(client);
      const rx = await submittedTx.getReceipt(client);
      console.log("Transfer receipt: ", rx.status.toString());
    } catch (err) {
      console.error("Error transferring to client: ", err);
      return { ok: false };
    }
  }
  // if token is non-hbar it needs approving
  if (inputToken !== config.whbarId) {
    console.log("Non-HBAR token, approving spend...");
    const approveTx =
      new AccountAllowanceApproveTransaction().approveTokenAllowance(
        inputToken,
        client.operatorAccountId,
        version === 2 ? config.v2swapRouter : config.v1swapRouter,
        inputAmount
      );
    try {
      const submittedTx = await approveTx.execute(client);
      const rx = await submittedTx.getReceipt(client);
      console.log("Approve receipt: ", rx.status.toString());
    } catch (err) {
      console.error("Error approving spend: ", err);
      return { ok: false };
    }
  }

  switch (version) {
    case 1:
      await handleV1Swap(client, recipientAddress, inputAmount, path);
      break;
    case 2:
      await handleV2Swap(client, recipientAddress, inputAmount, path);
      break;
    default:
      return { ok: false, message: "Invalid version" };
  }

  return { ok: true };
});
