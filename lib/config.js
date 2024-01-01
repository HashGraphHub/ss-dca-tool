module.exports =
  process.env.NETWORK === "testnet"
    ? {
        network: "testnet",
        jsonRpcUrl: "https://testnet.hashio.io/api",
        quoter: "0.0.3172630",
        swapRouter: "0.0.3172722",
        whbarId: "0.0.59042",
      }
    : {
        network: "mainnet",
        jsonRpcUrl: "https://mainnet.hashio.io/api",
        quoter: "0.0.3949424",
        swapRouter: "0.0.3949434",
        whbarId: "0.0.1456986",
      };
