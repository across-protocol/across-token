// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestToken is ERC20, Ownable {
    constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol) {}

    function mint(address _guy, uint256 _wad) public onlyOwner {
        _mint(_guy, _wad);
    }

    function burn(address _guy, uint256 _wad) public onlyOwner {
        _burn(_guy, _wad);
    }
}
