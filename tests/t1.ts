import {
  Connection,
  Keypair,
  PublicKey,
} from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';

const connection = new Connection("https://api.devnet.solana.com", 'confirmed');
const adminKeypair = Keypair.generate();
let tokenMint: PublicKey;
const TOKEN_NAME = "ABC";
const INITIAL_SUPPLY = 1000; // Initial supply of tokens

async function createToken() {
  // Create the token mint
  tokenMint = await createMint(
    connection,
    adminKeypair, // Payer
    adminKeypair.publicKey, // Mint authority
    null, // Freeze authority
    0 // Decimals
  );

  // Create an associated token account for the admin
  const adminTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    adminKeypair,
    tokenMint,
    adminKeypair.publicKey
  );

  // Mint initial supply of tokens to admin's account
  await mintTo(
    connection,
    adminKeypair,
    tokenMint,
    adminTokenAccount.address,
    adminKeypair,
    INITIAL_SUPPLY
  );

  console.log(`${TOKEN_NAME} created with supply of ${INITIAL_SUPPLY}`);
  console.log(`Admin's Token Account: ${adminTokenAccount.address.toString()}`);

  return {
    tokenMint,
    adminTokenAccount: adminTokenAccount.address,  // Export admin token account address here
    adminPublicKey: adminKeypair.publicKey,
    adminSecretKey: adminKeypair.secretKey, // Include the secret key here if necessary
    initialSupply: INITIAL_SUPPLY,
  };
}

// Function to airdrop SOL for testing
async function airdropSol(recipient: PublicKey, amount: number) {
  console.log(`Airdropping ${amount} SOL to ${recipient.toString()}...`);
  const signature = await connection.requestAirdrop(recipient, amount * 1e9);
  await connection.confirmTransaction(signature);
  console.log(`Airdrop complete.`);
}

// Export token details and admin initial supply
export async function createAndExportTokenDetails() {
  await airdropSol(adminKeypair.publicKey, 2);
  await createToken();

  return {
    tokenMint: tokenMint,
    adminTokenAccount: tokenMint,  // Pass the correct token account address from `createToken()`
    adminPublicKey: adminKeypair.publicKey,
    adminSecretKey: adminKeypair.secretKey,
    initialSupply: INITIAL_SUPPLY,
  };
}

// Run if this file is executed directly
if (require.main === module) {
  createAndExportTokenDetails().catch(console.error);
}
