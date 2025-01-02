import { createAndExportTokenDetails } from './t1';
import {
    TOKEN_PROGRAM_ID,
    getOrCreateAssociatedTokenAccount,
    transfer,
    getAccount,
} from '@solana/spl-token';
import {
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
} from '@solana/web3.js';
import * as readline from 'readline';

// Constants
const TRANSACTION_FEE = 0.000005; // Approximate transaction fee in SOL
const LAMPORTS_PER_SOL = 1000000000; // Conversion rate

const connection = new Connection("https://api.devnet.solana.com", 'confirmed');
let tokenMint: PublicKey;
let adminPublicKey: PublicKey;
let adminSecretKey: Uint8Array;
let adminTokenAccount: PublicKey;

type UserAccount = {
    keypair: Keypair;
    tokenAccount: PublicKey;
    stakingTime?: number;
    stakingAmount?: number;
    lockDuration?: number;
    stakingStartDate?: number;
    stakingEndDate?: number;
    apy?: number;
    canStake?: boolean; 
    lastAirdropTime?: number;
};

const userAccounts: UserAccount[] = [];

// Initialize the program
async function initialize() {
    const tokenDetails = await createAndExportTokenDetails();
    tokenMint = tokenDetails.tokenMint;
    adminPublicKey = tokenDetails.adminPublicKey;
    adminSecretKey = tokenDetails.adminSecretKey;

    adminTokenAccount = (await getOrCreateAssociatedTokenAccount(
        connection,
        Keypair.fromSecretKey(adminSecretKey),
        tokenMint,
        adminPublicKey
    )).address;

    console.log(`Token Mint: ${tokenMint.toString()}`);
    console.log(`Admin Address: ${adminPublicKey.toString()}`);
    console.log(`Admin Token Account: ${adminTokenAccount.toString()}`);

    // Check admin SOL balance and request airdrop if necessary
    const adminBalance = await connection.getBalance(adminPublicKey);
    if (adminBalance < TRANSACTION_FEE * LAMPORTS_PER_SOL) {
        console.log("Requesting SOL airdrop for admin...");
        const airdropSignature = await connection.requestAirdrop(
            adminPublicKey,
            1 * LAMPORTS_PER_SOL
        );
        await connection.confirmTransaction(airdropSignature);
        console.log("Airdrop completed for admin.");
    } else {
        console.log("Admin account is sufficiently funded with SOL.");
    }
}

// Function to add tokens to an account
async function addTokens(account: PublicKey, amount: number | string) {
    const parsedAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        console.error("Invalid amount. Please enter a positive number.");
        return;
    }

    try {
        const transactionSignature = await transfer(
            connection,
            Keypair.fromSecretKey(adminSecretKey),
            adminTokenAccount,
            account,
            adminPublicKey,
            parsedAmount
        );
        console.log(`Tokens successfully added. Transaction Signature: ${transactionSignature}`);
    } catch (error) {
        console.error("Error adding tokens:", error);
    }
}


// Display user token balance
async function showUserBalance(userKeypair: Keypair) {
    const userTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        userKeypair,
        tokenMint,
        userKeypair.publicKey
    );
    const accountInfo = await getAccount(connection, userTokenAccount.address);
    console.log(`User ${userKeypair.publicKey.toString()} balance: ${accountInfo.amount} tokens`);
}

// Display admin token balance
async function showAdminBalance() {
    const accountInfo = await getAccount(connection, adminTokenAccount);
    console.log(`Admin balance: ${accountInfo.amount} tokens`);
}

let currentStakingParameters: { startDate: number, endDate: number, lockDur: number, apy: number } | null = null;

// Admin Functionality to Set Staking Parameters
async function setStakingParameters(): Promise<{ startDate: number, endDate: number, lockDur: number, apy: number }> {
    const startDate = parseInt(await askQuestion("Enter staking start date (Unix timestamp in seconds): "), 10);
    const endDate = parseInt(await askQuestion("Enter staking end date (Unix timestamp in seconds): "), 10);
    const lockDur = parseInt(await askQuestion("Enter lock duration (in days): "), 10);
    const newApy = parseFloat(await askQuestion("Enter new APY (e.g., 0.1 for 10%): "));

    console.log(`Staking parameters set successfully.`);
    console.log(`Start Date: ${new Date(startDate * 1000).toLocaleString()}`);
    console.log(`End Date: ${new Date(endDate * 1000).toLocaleString()}`);
    console.log(`Lock Duration: ${lockDur} days`);
    console.log(`APY: ${(newApy * 100)}%`);

    // Store parameters globally so they can be accessed later
    currentStakingParameters = { startDate, endDate, lockDur, apy: newApy };

    return currentStakingParameters;
}

// Create user accounts
async function createUserAccounts(numUsers: number) {
    for (let i = 0; i < numUsers; i++) {
        const user = Keypair.generate();
        const userTokenAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            Keypair.fromSecretKey(adminSecretKey),
            tokenMint,
            user.publicKey
        );

        await addTokens(userTokenAccount.address, 200); // Example: giving each user 200 tokens
        userAccounts.push({ keypair: user, tokenAccount: userTokenAccount.address });
        console.log(`User account ${i + 1}: ${user.publicKey.toString()} credited with 200 tokens.`);
    }
}

// Function to display the admin-set staking parameters
async function showStakingParameters() {
  if (currentStakingParameters) {
    console.log("Current Staking Parameters:");
    console.log(`Start Date: ${new Date(currentStakingParameters.startDate * 1000).toLocaleString()}`);
    console.log(`End Date: ${new Date(currentStakingParameters.endDate * 1000).toLocaleString()}`);
    console.log(`Lock Duration: ${currentStakingParameters.lockDur} days`);
    console.log(`APY: ${(currentStakingParameters.apy * 100)}%`);
  } else {
    console.log("Staking parameters are not set yet.");
  }
}

async function stakeTokens(
  userKeypair: Keypair,
  amount: number,
  startDate: number,
  endDate: number,
  lockDuration: number,
  apy: number
) {
  const userIndex = userAccounts.findIndex(user =>
    user.keypair.publicKey.equals(userKeypair.publicKey)
  );

  if (userIndex === -1) {
    console.log("User not found.");
    return;
  }

  const userAccount = userAccounts[userIndex];
  if (userAccount.stakingAmount && !userAccount.canStake) {
    console.log("You must complete unstaking and claim your tokens before staking again.");
    return;
  }

  const userTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    userKeypair,
    tokenMint,
    userKeypair.publicKey
  );

  const accountInfo = await getAccount(connection, userTokenAccount.address);

  if (accountInfo.amount < amount) {
    console.error(`Insufficient tokens. Current balance: ${accountInfo.amount}`);
    return;
  }

  const userBalance = await connection.getBalance(userKeypair.publicKey);
  const now = Date.now();
  const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds

  if (userBalance < TRANSACTION_FEE * LAMPORTS_PER_SOL) {
    if (
      !userAccount.lastAirdropTime ||
      now - userAccount.lastAirdropTime >= oneHour
    ) {
      console.log("Requesting SOL airdrop for transaction fee...");
      
      // Delay for 1 hour
      console.log("Waiting for  before requesting airdrop...");
      await new Promise(resolve => setTimeout(resolve, 3600000));

      const airdropSignature = await connection.requestAirdrop(
        userKeypair.publicKey,
        LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(airdropSignature);
      userAccount.lastAirdropTime = Date.now();
      console.log("Airdrop completed.");
    } else {
      const remainingTime = oneHour - (now - userAccount.lastAirdropTime);
      const remainingMinutes = Math.ceil(remainingTime / 60000);
      console.log(`Airdrop is on cooldown. Please wait ${remainingMinutes} more minute(s).`);
      return;
    }
  }

  const currentDate = now / 1000; // Convert to seconds
  if (currentDate < startDate || currentDate > endDate) {
    console.log(
      `Staking is not allowed at this point. Staking is allowed only between ${new Date(
        startDate * 1000
      ).toLocaleString()} and ${new Date(endDate * 1000).toLocaleString()}.`
    );
    return;
  }

  try {
    const transactionSignature = await transfer(
      connection,
      userKeypair,
      userTokenAccount.address,
      adminTokenAccount,
      userKeypair.publicKey,
      amount
    );
    console.log(`Tokens successfully staked. Transaction Signature: ${transactionSignature}`);

    userAccounts[userIndex].stakingTime = now;
    userAccounts[userIndex].stakingAmount = amount;
    userAccounts[userIndex].lockDuration =
      userAccount.lockDuration ?? lockDuration; // Existing users retain their duration
    userAccounts[userIndex].apy = userAccount.apy ?? apy; // Existing users retain their APY
    userAccounts[userIndex].stakingStartDate = startDate;
    userAccounts[userIndex].stakingEndDate = endDate;
    userAccounts[userIndex].canStake = false; // No more staking until claim

    console.log(`User ${userKeypair.publicKey.toString()} has staked ${amount} tokens.`);
  } catch (error) {
    console.error("Error staking tokens:", error);
  }
}


async function claimTokens(userKeypair: Keypair) {
  const userIndex = userAccounts.findIndex(user => user.keypair.publicKey.equals(userKeypair.publicKey));

  if (userIndex === -1) {
      console.log("User not found.");
      return;
  }

  const userAccount = userAccounts[userIndex];

  if (!userAccount.stakingAmount) {
      console.log("No tokens staked to claim.");
      return;
  }

  const currentDate = Date.now() / 1000;  // Current time in Unix format (seconds)

  // Check if lock duration has been met
  const lockEndDate = userAccount.stakingStartDate! + (userAccount.lockDuration! * 24 * 60 * 60); // Convert lock duration to seconds
  if (currentDate < lockEndDate) {
      const remainingDays = Math.ceil((lockEndDate - currentDate) / (60 * 60 * 24)); // Remaining days
      console.log(`Lock duration of ${userAccount.lockDuration} days not completed. You cannot claim yet. Please wait ${remainingDays} more day(s).`);
      return;
  }

  // If lock duration is met, calculate APY and distribute rewards
  const apyReward = (userAccount.stakingAmount! * userAccount.apy!);
  const totalAmount = userAccount.stakingAmount! + apyReward;

  console.log(`Lock duration met. You will receive the staked tokens along with rewards based on your APY of ${(userAccount.apy! * 100)}%.`);
  console.log(`Total Amount: ${totalAmount} tokens`);

  try {
      const transactionSignature = await transfer(
          connection,
          Keypair.fromSecretKey(adminSecretKey),
          adminTokenAccount,
          userAccount.tokenAccount,
          adminPublicKey,
          totalAmount
      );
      console.log(`Tokens and rewards successfully claimed. Transaction Signature: ${transactionSignature}`);

      userAccount.stakingAmount = 0; // Reset staked amount after claim
      userAccount.canStake = true; // Allow the user to stake again after successful claim
  } catch (error) {
      console.error("Error claiming tokens:", error);
  }
}




// Ask questions using readline
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function askQuestion(query: string): Promise<string> {
    return new Promise((resolve) => rl.question(query, resolve));
}

// Main Loop
async function main() {
    await initialize();

    let action = '';
    let stakingParams: { startDate: number, endDate: number, lockDur: number, apy: number } = { startDate: 0, endDate: 0, lockDur: 0, apy: 0 };

    while (true) {
        console.log("\nAvailable Actions:");
        console.log("1: Set Staking Parameters");
        console.log("2: Create User Accounts");
        console.log("3: Stake Tokens");
        console.log("4: Claim Staked Tokens");
        console.log("0: Exit");
        action = await askQuestion("Select an action: ");

        switch (action) {
            case '1':
                stakingParams = await setStakingParameters();
                break;
            case '2':
                const numUsers = parseInt(await askQuestion("Enter the number of users to create: "), 10);
                await createUserAccounts(numUsers);
                break;
            case '3': {
                await showStakingParameters();
                const userIndex = parseInt(await askQuestion("Select user index (0-based): "), 10);
                if (userIndex < 0 || userIndex >= userAccounts.length) {
                    console.log("Invalid user index.");
                    break;
                }

                const amount = parseFloat(await askQuestion("Enter staking amount: "));
                await stakeTokens(
                    userAccounts[userIndex].keypair,
                    amount,
                    stakingParams.startDate,
                    stakingParams.endDate,
                    stakingParams.lockDur,
                    stakingParams.apy
                );
                break;
            }
            case '4': {
                await showStakingParameters();
                const userIndex = parseInt(await askQuestion("Select user index (0-based): "), 10);
                if (userIndex < 0 || userIndex >= userAccounts.length) {
                    console.log("Invalid user index.");
                    break;
                }
                await claimTokens(userAccounts[userIndex].keypair);
                break;
            }
            case '0':
                rl.close();
                return;
            default:
                console.log("Invalid action.");
                break;
        }
    }
}

// Execute the main function
main().catch(error => {
    console.error("An error occurred:", error);
    rl.close();
});
