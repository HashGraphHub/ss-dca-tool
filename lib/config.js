module.exports =
  process.env.NETWORK === "testnet"
    ? {
        network: "testnet",
        jsonRpcUrl: "https://testnet.hashio.io/api",
        v2quoter: "0.0.1390002",
        v1swapRouter: "0.0.19264",
        v2swapRouter: "0.0.1414040",
        whbarId: "0.0.15058",
      }
    : {
        network: "mainnet",
        jsonRpcUrl: "https://mainnet.hashio.io/api",
        v2quoter: "0.0.3949424",
        v1swapRouter: "0.0.3045981",
        v2swapRouter: "0.0.3949434",
        whbarId: "0.0.1456986",
      };
