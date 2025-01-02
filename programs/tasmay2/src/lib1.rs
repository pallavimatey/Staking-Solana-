use solana_client::rpc_client::RpcClient;
use solana_program::pubkey::Pubkey;
use solana_sdk::{
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use spl_token::{
    instruction::{initialize_mint, mint_to, transfer},
    state::Mint,
};
use spl_associated_token_account::instruction::create_associated_token_account;

const TOKEN_NAME: &str = "ABC";
const INITIAL_SUPPLY: u64 = 1000;

pub struct TokenDetails {
    pub token_mint: Pubkey,
    pub admin_token_account: Pubkey,
    pub admin_public_key: Pubkey,
    pub initial_supply: u64,
}

pub fn create_token(client: &RpcClient, payer: &Keypair) -> TokenDetails {
    // Create a new keypair for the mint
    let mint = Keypair::new();
    let mint_pubkey = mint.pubkey();
    
    // Initialize the mint
    let mut transaction = Transaction::new_with_payer(
        &[
            initialize_mint(
                &spl_token::id(),
                &mint_pubkey,
                &payer.pubkey(),
                None, // Freeze authority
                0,    // Decimals
            )
            .unwrap(),
        ],
        Some(&payer.pubkey()),
    );

    transaction.sign(&[payer, &mint], client.get_latest_blockhash().unwrap());
    client.send_and_confirm_transaction(&transaction).unwrap();

    // Create admin associated token account
    let admin_token_account = Pubkey::create_with_seed(
        &payer.pubkey(),
        &format!("{}-account", TOKEN_NAME),
        &spl_associated_token_account::id(),
    )
    .unwrap();

    let create_assoc_account_tx = Transaction::new_signed_with_payer(
        &[create_associated_token_account(
            &payer.pubkey(),
            &payer.pubkey(),
            &mint_pubkey,
        )],
        Some(&payer.pubkey()),
        &[payer],
        client.get_latest_blockhash().unwrap(),
    );
    client.send_and_confirm_transaction(&create_assoc_account_tx).unwrap();

    // Mint tokens to the admin's token account
    let mut mint_to_tx = Transaction::new_signed_with_payer(
        &[mint_to(
            &spl_token::id(),
            &mint_pubkey,
            &admin_token_account,
            &payer.pubkey(),
            &[],
            INITIAL_SUPPLY,
        )
        .unwrap()],
        Some(&payer.pubkey()),
        &[payer, &mint],
        client.get_latest_blockhash().unwrap(),
    );
    client.send_and_confirm_transaction(&mint_to_tx).unwrap();

    println!(
        "{} created with initial supply of {}",
        TOKEN_NAME, INITIAL_SUPPLY
    );

    TokenDetails {
        token_mint: mint_pubkey,
        admin_token_account,
        admin_public_key: payer.pubkey(),
        initial_supply: INITIAL_SUPPLY,
    }
}

// Function to airdrop SOL for testing purposes
pub fn airdrop_sol(client: &RpcClient, recipient: &Pubkey, amount: u64) {
    println!("Airdropping {} SOL to {}...", amount, recipient);
    client.request_airdrop(recipient, amount).unwrap();
    println!("Airdrop complete.");
}

fn main() {
    let connection = RpcClient::new("https://api.devnet.solana.com".to_string());
    let admin_keypair = Keypair::new();

    airdrop_sol(&connection, &admin_keypair.pubkey(), 2 * 1_000_000_000); // Airdrop 2 SOL
    let token_details = create_token(&connection, &admin_keypair);

    println!(
        "Token Mint: {}\nAdmin Token Account: {}\nAdmin Public Key: {}\nInitial Supply: {}",
        token_details.token_mint,
        token_details.admin_token_account,
        token_details.admin_public_key,
        token_details.initial_supply,
    );
}
