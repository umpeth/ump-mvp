// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

// With specific imports
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

contract ReceiptERC1155 is ERC1155, Ownable {
    using Strings for uint256;

    struct TokenMetadata {
        string name;
        string description;
        string image;
        string termsOfService;
        string[] supplementalImages;
    }

    mapping(uint256 => TokenMetadata) private _tokenMetadata;
    string private _contractURI;

    event ContractURIUpdated(string newURI);
    event OwnershipChanged(address indexed previousOwner, address indexed newOwner);

    constructor(string memory contractURI_) ERC1155("") Ownable(msg.sender) {
        _contractURI = contractURI_;
    }

    function mint(address account, uint256 id, uint256 amount, bytes memory data) public onlyOwner {
        _mint(account, id, amount, data);
    }

    function mintBatch(address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data) public onlyOwner {
        _mintBatch(to, ids, amounts, data);
    }

    function setTokenMetadata(
        uint256 tokenId,
        string memory name,
        string memory description,
        string memory image,
        string memory termsOfService,
        string[] memory supplementalImages
    ) public onlyOwner {
        _tokenMetadata[tokenId] = TokenMetadata(
            name,
            description,
            image,
            termsOfService,
            supplementalImages
        );
    }

function uri(uint256 tokenId) public view virtual override returns (string memory) {
    TokenMetadata memory metadata = _tokenMetadata[tokenId];
    
    string memory supplementalImagesJson = _generateSupplementalImagesJson(metadata.supplementalImages);
    
    string memory attributes = string(abi.encodePacked(
        '[{"trait_type":"Terms of Service","value":"', metadata.termsOfService, '"},',
        '{"trait_type":"Supplemental Images","value":', supplementalImagesJson, '}]'
    ));

    string memory json = Base64.encode(
        bytes(string(
            abi.encodePacked(
                '{"name": "', metadata.name, '",',
                '"description": "', metadata.description, '",',
                '"image": "', metadata.image, '",',
                '"attributes": ', attributes, '}'
            )
        ))
    );

    return string(abi.encodePacked("data:application/json;base64,", json));
}

function _generateSupplementalImagesJson(string[] memory images) internal pure returns (string memory) {
    if (images.length == 0) {
        return "[]";
    }

    string memory result = "[";
    for (uint256 i = 0; i < images.length; i++) {
        if (i > 0) {
            result = string(abi.encodePacked(result, ","));
        }
        result = string(abi.encodePacked(result, "\"", images[i], "\""));
    }
    result = string(abi.encodePacked(result, "]"));

    return result;
}

    function getTokenMetadata(uint256 tokenId) public view returns (TokenMetadata memory) {
        return _tokenMetadata[tokenId];
    }

    function contractURI() public view returns (string memory) {
        return _contractURI;
    }

    function setContractURI(string memory newURI) public onlyOwner {
        _contractURI = newURI;
        emit ContractURIUpdated(newURI);
    }

    function changeOwnership(address newOwner) public onlyOwner {
        address oldOwner = owner();
        _transferOwnership(newOwner);
        emit OwnershipChanged(oldOwner, newOwner);
    }
}