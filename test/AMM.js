const { expect } = require("chai");
const { ethers } = require("hardhat");
const sqrt = require('bigint-isqrt')

describe("-- AMM Contract --", function () {

    let user;
    let chelsea_owner;
    let wrappedSepoliaEtherContract;
    let chelseaContract;
    let ammContract;

    beforeEach(async () => {
        [weth_deployer, chelsea_owner, AMM_deployer, user] = await ethers.getSigners();

        //////////////////////////
        // Contracts Deployment //
        //////////////////////////

        // Deploy WrappedSepoliaEther Contract
        const WrappedSepoliaEther = await ethers.getContractFactory("WrappedSepoliaEther");
        wrappedSepoliaEtherContract = await WrappedSepoliaEther.connect(weth_deployer).deploy();

        // Deploy Chelsea Contract
        const ChelseaToken = await ethers.getContractFactory("ChelseaToken");
        chelseaContract = await ChelseaToken.connect(chelsea_owner).deploy();

        //Deploy AMM Contract
        const AMM = await ethers.getContractFactory("AMM");
        ammContract = await AMM.connect(AMM_deployer).deploy(chelseaContract.target, wrappedSepoliaEtherContract.target);

        //////////////////// 
        // Reset Balances //
        ////////////////////

        await network.provider.send("hardhat_setBalance", [
            chelsea_owner.address,
            "0x56BC75E2D63100000", //100 ETH in HEX
        ]);
        await network.provider.send("hardhat_setBalance", [
            user.address,
            "0x56BC75E2D63100000",
        ]);

        ////////////////////// 
        // Prepare personas //
        //////////////////////

        //user should have WETH in order to interact with the pair later:
        await user.sendTransaction({
            to: wrappedSepoliaEtherContract.target,
            value: ethers.parseEther("5"), // 5 ETH
        });

        //chelsea_owner should have WETH in order to create the pair later:
        await chelsea_owner.sendTransaction({
            to: wrappedSepoliaEtherContract.target,
            value: ethers.parseEther("10"),
        });

        //Before each test, we have the following:
        // - WETH, Chelsea, and AMM contracts deployed.
        // - user               :   5 WETH,     ~95 ETH,    0 CHE
        // - chelsea_owner   :   10 WETH,    ~90 ETH,    1,000,000 CHE
    });

    describe("# Add Liquidity:", function () {
        it("Should revert if passed amountA <= 0 or passed amountB <= 0", async function () {
            let amountCHE = 0;
            let amountWETH = 0;

            await expect(
                ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH)
            ).to.be.revertedWith("Invalid amounts");

            amountCHE = 1000000;
            amountWETH = 0;

            await expect(
                ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH)
            ).to.be.revertedWith("Invalid amounts");

            amountCHE = 0;
            amountWETH = 1000000;

            await expect(
                ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH)
            ).to.be.revertedWith("Invalid amounts");
        });

        it("Should revert if calculated liquidity <= 0 ", async function () {
            await network.provider.send("hardhat_setBalance", [
                chelsea_owner.address,
                "0x152D482B72CD3B740000", //100005 ETH in HEX
            ]);

            await chelsea_owner.sendTransaction({
                to: wrappedSepoliaEtherContract.target,
                value: ethers.parseEther("100001"),
            });

            let amountCHE = await chelseaContract.totalSupply() - BigInt("1");
            let amountWETH = ethers.parseEther("100000") - BigInt("1");

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            // adding huge amount of tokens to the liquidity pool
            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            amountCHE = BigInt("1");
            amountWETH = BigInt("1");

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            // trying to add a tiny amount of tokens to the liquidity pool
            await expect(
                ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH)
            ).to.be.revertedWith("Insufficient liquidity");
        });

        it("Should add liquidity, mint LP tokens, and emit events", async function () {
            let amountCHE = await chelseaContract.totalSupply();
            let amountWETH = ethers.parseEther("10");

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            expect(await ammContract.balanceOf(chelsea_owner.address)).to.equal(BigInt("0"));

            expect(await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH)).to.emit(ammContract, "AddLiquidity")
                .withArgs(chelsea_owner.address, amountCHE, amountWETH);

            expect(await ammContract.balanceOf(chelsea_owner.address)).to.equal(sqrt(amountCHE * amountWETH));
        });

    });

    describe("# Remove Liquidity:", function () {
        it("Should revert if passed liquidity <= 0", async function () {
            await expect(
                ammContract.connect(chelsea_owner).removeLiquidity(0)
            ).to.be.revertedWith("Invalid liquidity");
        });

        it("Should revert if passed liquidity >= sender liquidity balance", async function () {
            const amountCHE = await chelseaContract.totalSupply();
            const amountWETH = ethers.parseEther("10");

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            const reverting_liquidity = await ammContract.balanceOf(chelsea_owner.address) + BigInt("1");

            await expect(
                ammContract.connect(chelsea_owner).removeLiquidity(reverting_liquidity)
            ).to.be.revertedWith("Invalid liquidity");
        });

        it("Should remove liquidity #1", async function () {
            let amountCHE = await chelseaContract.totalSupply();
            let amountWETH = ethers.parseEther("10");

            const liquidityToBe = sqrt(amountCHE * amountWETH);

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            expect(await ammContract.balanceOf(chelsea_owner)).to.equal(liquidityToBe);

            expect(await ammContract.connect(chelsea_owner).removeLiquidity(liquidityToBe)).to.emit(ammContract, "Remove liquidity").withArgs(amountCHE, amountWETH);

            expect(await ammContract.balanceOf(chelsea_owner)).to.equal(BigInt("0"));
        });

        it("Should remove liquidity #2", async function () {
            let amountCHE = await chelseaContract.totalSupply();
            let amountWETH = ethers.parseEther("10");

            const liquidityToBe = sqrt(amountCHE * amountWETH);

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            expect(await ammContract.balanceOf(chelsea_owner)).to.equal(liquidityToBe);

            expect(await ammContract.connect(chelsea_owner).removeLiquidity(liquidityToBe / BigInt("2"))).to.emit(ammContract, "Remove liquidity").withArgs(amountCHE, amountWETH);

            expect(await ammContract.balanceOf(chelsea_owner)).to.equal(liquidityToBe - (liquidityToBe / BigInt("2")));
        });

        it("Should result in owner profit after multiple swaps", async function () {
            let amountCHE = await chelseaContract.totalSupply();
            let amountWETH = ethers.parseEther("10");

            const liquidityToBe = sqrt(amountCHE * amountWETH);

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            expect(await ammContract.balanceOf(chelsea_owner)).to.equal(liquidityToBe);

            // Perform multiple swaps
            const BAswapAmount = ethers.parseEther("1");
            const ABswapAmount = ethers.parseEther("90000");

            await wrappedSepoliaEtherContract.connect(user).approve(ammContract.target, ethers.parseEther("20"));
            await chelseaContract.connect(user).approve(ammContract.target, ethers.parseEther("1000000"));

            for (let i = 0; i < 10; i++) {
                if (i % 2 === 0) {
                    await ammContract.connect(user).swap(wrappedSepoliaEtherContract.target, chelseaContract.target, BAswapAmount, BigInt("0"));
                } else {
                    await ammContract.connect(user).swap(chelseaContract.target, wrappedSepoliaEtherContract.target, ABswapAmount, BigInt("0"));
                }
            }

            await chelseaContract.connect(user).approve(ammContract.target, ethers.parseEther("1000000"));
            await ammContract.connect(user).swap(chelseaContract.target, wrappedSepoliaEtherContract.target, await chelseaContract.balanceOf(user.address), BigInt("0"));

            await ammContract.connect(chelsea_owner).removeLiquidity(liquidityToBe);

            const finalWETHBalance = await wrappedSepoliaEtherContract.balanceOf(chelsea_owner.address);
            const finalCHEBalance = await chelseaContract.balanceOf(chelsea_owner.address);

            expect(finalWETHBalance).to.be.greaterThan(amountWETH);
            expect(finalCHEBalance).to.equal(amountCHE);
        });

    });

    describe("# Swap:", function () {
        it("Should revert if amountIn is zero", async function () {
            await expect(
                ammContract.connect(user).swap(wrappedSepoliaEtherContract.target, chelseaContract.target, 0, BigInt("0"))
            ).to.be.revertedWith("Invalid amountIn");
        });

        it("Should revert if tokenIn is the same as tokenOut", async function () {
            await expect(
                ammContract.connect(user).swap(wrappedSepoliaEtherContract.target, wrappedSepoliaEtherContract.target, ethers.parseEther("1"), BigInt("0"))
            ).to.be.revertedWith("Invalid tokenOut");
        });

        it("Should correctly update reserves after a swap", async function () {
            const initialReserveA = await ammContract.reserveA();
            const initialReserveB = await ammContract.reserveB();

            const amountIn = ethers.parseEther("0.005");
            const amountOut = await ammContract.getAmountOut(amountIn, initialReserveB, initialReserveA);

            await wrappedSepoliaEtherContract.connect(user).approve(ammContract.target, amountIn);
            await ammContract.connect(user).swap(wrappedSepoliaEtherContract.target, chelseaContract.target, amountIn, BigInt("0"));

            const finalReserveA = await ammContract.reserveA();
            const finalReserveB = await ammContract.reserveB();

            expect(finalReserveA).to.equal(initialReserveA - amountOut);
            expect(finalReserveB).to.equal(initialReserveB + amountIn);
        });

        it("Should handle small swaps without errors", async function () {
            let amountCHE = await chelseaContract.totalSupply();
            let amountWETH = ethers.parseEther("10");

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            const amountIn = ethers.parseEther("0.0001");
            await wrappedSepoliaEtherContract.connect(user).approve(ammContract.target, amountIn);

            const amountOut = await ammContract.getAmountOut(amountIn, await ammContract.reserveB(), await ammContract.reserveA());
            expect(amountOut).to.be.greaterThan(0);

            await expect(
                ammContract.connect(user).swap(wrappedSepoliaEtherContract.target, chelseaContract.target, amountIn, BigInt("0"))
            ).to.emit(ammContract, "Swap");
        });

        it("Should handle large swaps without errors", async function () {
            let amountCHE = await chelseaContract.totalSupply();
            let amountWETH = ethers.parseEther("10");

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            const reserveB = await ammContract.reserveB();
            const amountIn = reserveB / 2n;

            await wrappedSepoliaEtherContract.connect(user).approve(ammContract.target, amountIn);

            const amountOut = await ammContract.getAmountOut(amountIn, reserveB, await ammContract.reserveA());
            expect(amountOut).to.be.greaterThan(0);

            await expect(
                ammContract.connect(user).swap(wrappedSepoliaEtherContract.target, chelseaContract.target, amountIn, BigInt("0"))
            ).to.emit(ammContract, "Swap");
        });


        it("Should emit Swap event with correct parameters", async function () {
            const amountIn = ethers.parseEther("0.005");
            const amountOut = await ammContract.getAmountOut(amountIn, await ammContract.reserveB(), await ammContract.reserveA());

            await wrappedSepoliaEtherContract.connect(user).approve(ammContract.target, amountIn);

            await expect(
                ammContract.connect(user).swap(wrappedSepoliaEtherContract.target, chelseaContract.target, amountIn, BigInt("0"))
            ).to.emit(ammContract, "Swap")
                .withArgs(amountIn, amountOut, wrappedSepoliaEtherContract.target, chelseaContract.target);
        });

        it("Should consume reasonable gas for swap function", async function () {
            const amountIn = ethers.parseEther("0.01");
            await wrappedSepoliaEtherContract.connect(user).approve(ammContract.target, amountIn);

            const tx = await ammContract.connect(user).swap(wrappedSepoliaEtherContract.target, chelseaContract.target, amountIn, BigInt("0"));
            const receipt = await tx.wait();

            // console.log("Gas Used:", receipt.gasUsed.toString());
            expect(receipt.gasUsed).to.be.lessThan(150000);
        });


        it("Should revert if passed tokens are not in the pair", async function () {
            let amountCHE = await chelseaContract.totalSupply();
            let amountWETH = ethers.parseEther("10");

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            await wrappedSepoliaEtherContract.connect(user).approve(ammContract.target, ethers.parseEther("20"));

            await expect(
                ammContract.connect(user).swap(ammContract.target, chelseaContract.target, ethers.parseEther("1"), BigInt("0")) //Wrong tokenA
            ).to.be.revertedWith("Invalid tokenIn");
            await expect(
                ammContract.connect(user).swap(chelseaContract.target, ammContract.target, ethers.parseEther("1"), BigInt("0")) //Wrong tokenB
            ).to.be.revertedWith("Invalid tokenOut");
        });

        it("Should revert if amountOut is less than amountOutMin", async function () {
            let amountCHE = await chelseaContract.totalSupply();
            let amountWETH = ethers.parseEther("10");

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            await wrappedSepoliaEtherContract.connect(user).approve(ammContract.target, ethers.parseEther("20"));

            expect(await ammContract.connect(user).swap(wrappedSepoliaEtherContract.target, chelseaContract.target, ethers.parseEther("1"), BigInt("10000"))).to.be.revertedWith("Slippage tolerance exceeded")
        });

        it("Should swap tokenA to tokenB and tokenB to tokenA", async function () {
            let amountCHE = await chelseaContract.totalSupply();
            let amountWETH = ethers.parseEther("10");

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            expect(await chelseaContract.balanceOf(user.address)).to.equal(BigInt("0"));

            await wrappedSepoliaEtherContract.connect(user).approve(ammContract.target, ethers.parseEther("0.005"));
            const amountToBeSent = ethers.parseEther("0.005") * BigInt("998") * await ammContract.reserveA() / (await ammContract.reserveB() * BigInt("1000") + ethers.parseEther("0.005") * BigInt("998"));

            expect(await ammContract.connect(user).swap(wrappedSepoliaEtherContract.target, chelseaContract.target, ethers.parseEther("0.005"), BigInt("0"))).to.emit(ammContract, "Swap")
                .withArgs(ethers.parseEther("0.005"), amountToBeSent, wrappedSepoliaEtherContract.target, chelsea_owner.target);

            expect(await chelseaContract.balanceOf(user.address)).to.equal(amountToBeSent);

            await chelseaContract.connect(user).approve(ammContract.target, amountToBeSent);

            const amountToBeSent2 = amountToBeSent * BigInt("998") * await ammContract.reserveB() / (await ammContract.reserveA() * BigInt("1000") + amountToBeSent * BigInt("998"));


            expect(await ammContract.connect(user).swap(chelseaContract.target, wrappedSepoliaEtherContract.target, amountToBeSent, BigInt("0"))).to.emit(ammContract, "Swap")
                .withArgs(amountToBeSent, amountToBeSent2, chelsea_owner.target, wrappedSepoliaEtherContract.target);
        });
    });
});