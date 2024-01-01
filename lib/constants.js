module.exports.abi = [
  "function quoteExactInput(bytes memory path, uint256 amountIn) external returns (uint256 amountOut, uint160[] memory sqrtPriceX96AfterList, uint32[] memory initializedTicksCrossedList, uint256 gasEstimate)",
  "function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum) params) external payable returns (uint256 amountOut)",
  "function refundETH() external",
  "function multicall(bytes[] data) external payable returns (bytes[] results)",
  "function unwrapWHBAR(uint256 amountMinimum, address recipient) external payable",
];
