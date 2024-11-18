//SPDX-License-Identifier: MIT

pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract AMM is ERC20 {
    using Math for uint256;

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

    function addLiquidity(uint256 amountA, uint256 amountB) external {
        require(amountA > 0 && amountB > 0, "Invalid amounts");

        //Get the tokens that the pair consists of
        tokenA.transferFrom(msg.sender, address(this), amountA);
        tokenB.transferFrom(msg.sender, address(this), amountB);

        //Calculate the Liquidity Provider Tokens to be issued for this liquidity addition
        uint256 liquidity;
        if (totalSupply() == 0) {
            liquidity = Math.sqrt(amountA * amountB);
        } else {
            liquidity = Math.min(
                (amountA * totalSupply()) / reserveA,
                (amountB * totalSupply()) / reserveB
            );
        }

        require(liquidity > 0, "Insufficient liquidity");

        _mint(msg.sender, liquidity);

        //Update the reserved amounts
        reserveA += amountA;
        reserveB += amountB;
    }

    function removeLiquidity(uint256 liquidity) external {
        require(
            liquidity > 0 && balanceOf(msg.sender) >= liquidity,
            "Invalid liquidity"
        );

        //Calculate the Liquidity Provider Tokens to be burned for this liquidity removal
        uint256 amountA = (liquidity * reserveA) / totalSupply();
        uint256 amountB = (liquidity * reserveB) / totalSupply();

        //Burn the received Liquidity Provider Tokens
        _burn(msg.sender, liquidity);

        //Update the reserved amounts
        reserveA -= amountA;
        reserveB -= amountB;

        //Send (tokenA)s and (tokenB)s back
        tokenA.transfer(msg.sender, amountA);
        tokenB.transfer(msg.sender, amountB);
    }

    function swapBForA(uint256 amountIn) external {
        require(amountIn > 0, "Invalid input amount");

        uint256 amountOut = getAmountOut(amountIn, reserveB, reserveA);
        require(amountOut > 0, "Insufficient output amount");

        tokenB.transferFrom(msg.sender, address(this), amountIn);
        tokenA.transfer(msg.sender, amountOut);

        reserveB += amountIn;
        reserveA -= amountOut;
    }

    function swapAForB(uint256 amountIn) external {
        require(amountIn > 0, "Invalid input amount");

        uint256 amountOut = getAmountOut(amountIn, reserveA, reserveB);
        require(amountOut > 0, "Insufficient output amount");

        tokenA.transferFrom(msg.sender, address(this), amountIn);
        tokenB.transfer(msg.sender, amountOut);

        reserveA += amountIn;
        reserveB -= amountOut;
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256) {
        uint256 amountInWithFee = amountIn * 998; //0.2% fee
        return
            (amountInWithFee * reserveOut) /
            (reserveIn * 1000 + amountInWithFee);
    }
}
