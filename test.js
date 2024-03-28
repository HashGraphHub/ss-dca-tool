require("dotenv").config();

const jsonData = {
  data: {
    version: 1,
    account: process.env.ACCOUNT_ID,
    tokens: ["0.0.456858", "0.0.1456986"],
    // tokens: ["0.0.456858", "0.0.731861", "0.0.2964435", "0.0.1159074"],
    inputAmount: 7_000000,
    fees: [],
  },
  attributes: { attr1: "attr1-value" },
  subscription: "projects/MY-PROJECT/subscriptions/MY-SUB",
};

sendPubSubMessage(jsonData)
  .then((response) => response.json())
  .then((data) => console.log(data))
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

async function sendPubSubMessage(jsonData) {
  const base64Data = Buffer.from(JSON.stringify(jsonData.data)).toString(
    "base64"
  );
  const message = {
    message: {
      data: base64Data,
      attributes: jsonData.attributes,
    },
    subscription: jsonData.subscription,
  };

  const response = await fetch("http://localhost:8080", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ce-id": "123451234512345",
      "ce-specversion": "1.0",
      "ce-time": new Date().toISOString(),
      "ce-type": "google.cloud.pubsub.topic.v1.messagePublished",
      "ce-source":
        "//pubsub.googleapis.com/projects/MY-PROJECT/topics/MY-TOPIC",
    },
    body: JSON.stringify(message),
  });

  return response;
}
