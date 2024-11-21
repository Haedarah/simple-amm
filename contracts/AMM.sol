//SPDX-License-Identifier: MIT

pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract AMM is ERC20, ReentrancyGuard {
    using Math for uint256;

    event AddLiquidity(uint256 amountA, uint256 amountB, uint256 liquidity);
    event RemoveLiquidity(uint256 amountA, uint256 amountB);
    event Swap(
        uint256 amountIn,
        uint256 amountOut,
        address tokenIn,
        address tokenOut
    );

    IERC20 public tokenA; //Interface for tokenA
    IERC20 public tokenB; //Interface for tokenB

    uint256 public reserveA; //The amount of tokenA in the pool
    uint256 public reserveB; //The amount of tokenB in the pool

    constructor(
        address _tokenA,
        address _tokenB
    ) ERC20("Liquidity Provider Token", "LP") {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
    }

    function addLiquidity(
        uint256 amountA,
        uint256 amountB
    ) external nonReentrant {
        require(amountA > 0 && amountB > 0, "Invalid amounts");

        //Get the tokens that the pair consists of
        tokenA.transferFrom(msg.sender, address(this), amountA);
        tokenB.transferFrom(msg.sender, address(this), amountB);

        uint256 currentTotalSupply = totalSupply();
        uint256 liquidity;

        if (currentTotalSupply == 0) {
            liquidity = _safeSqrt(amountA * amountB);
        } else {
            liquidity = Math.min(
                (amountA * currentTotalSupply) / reserveA,
                (amountB * currentTotalSupply) / reserveB
            );
        }

        require(liquidity > 0, "Insufficient liquidity");
        _mint(msg.sender, liquidity);

        _updateReserves();

        emit AddLiquidity(amountA, amountB, liquidity);
    }

    function removeLiquidity(uint256 liquidity) external nonReentrant {
        require(
            liquidity > 0 && balanceOf(msg.sender) >= liquidity,
            "Invalid liquidity"
        );

        uint256 currentTotalSupply = totalSupply();
        uint256 amountA = (liquidity * reserveA) / currentTotalSupply;
        uint256 amountB = (liquidity * reserveB) / currentTotalSupply;

        _burn(msg.sender, liquidity);

        // Transfer tokens and update reserves
        tokenA.transfer(msg.sender, amountA);
        tokenB.transfer(msg.sender, amountB);

        _updateReserves();

        emit RemoveLiquidity(amountA, amountB);
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin
    ) external nonReentrant {
        require(
            tokenIn == address(tokenA) || tokenIn == address(tokenB),
            "Invalid tokenIn"
        );
        require(
            (tokenOut == address(tokenA) || tokenOut == address(tokenB)) &&
                (tokenIn != tokenOut),
            "Invalid tokenOut"
        );
        require(amountIn > 0, "Invalid amountIn");

        (uint256 reserveIn, uint256 reserveOut) = tokenIn == address(tokenA)
            ? (reserveA, reserveB)
            : (reserveB, reserveA);

        uint256 amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
        require(amountOut >= amountOutMin, "Slippage tolerance exceeded");

        _validateAllowanceAndTransfer(
            IERC20(tokenIn),
            msg.sender,
            address(this),
            amountIn
        );
        IERC20(tokenOut).transfer(msg.sender, amountOut);

        _updateReserves();

        emit Swap(amountIn, amountOut, tokenIn, tokenOut);
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256) {
        uint256 amountInWithFee = amountIn * 998; // Deduct 0.2% fee
        uint256 denominator = reserveIn * 1000 + amountInWithFee;
        return (amountInWithFee * reserveOut) / denominator;
    }

    function _safeSqrt(uint256 y) internal pure returns (uint256) {
        if (y == 0) return 0;
        uint256 z = (y + 1) / 2;
        uint256 result = y;
        while (z < result) {
            result = z;
            z = (y / z + z) / 2;
        }
        return result;
    }

    function _updateReserves() internal {
        reserveA = tokenA.balanceOf(address(this));
        reserveB = tokenB.balanceOf(address(this));
    }

    function _validateAllowanceAndTransfer(
        IERC20 token,
        address from,
        address to,
        uint256 amount
    ) internal {
        require(token.allowance(from, to) >= amount, "Allowance too low");
        token.transferFrom(from, to, amount);
    }
}
