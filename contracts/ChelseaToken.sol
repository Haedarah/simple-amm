// SPDX-License-Identifier: MIT

pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ChelseaToken is ERC20 {
    uint256 private constant INITIAL_SUPPLY = 1000000 * (10 ** 18);

    constructor() ERC20("Chelsea", "CHE") {
        _mint(msg.sender, INITIAL_SUPPLY);
    }
}
