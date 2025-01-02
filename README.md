## Solana Staking Program

## Staking and Unstaking with Fixed APY:
Users can stake a specific SPL token and earn rewards based on a fixed APY.
Rewards should be calculated per block or per second.
Only one active stake is allowed per user at a time.
If a user unstakes their tokens, they can stake them again.

## End User Functionalities:
View staking start and end times, and the lock duration for the stake. (Users should be able to stake between the start and end times only)
Earn rewards based on the staking time and claim them at any point.
Unstake tokens only after a fixed lock period.

## Owner Functionalities:
Set staking start and end dates and lock duration.
Update these parameters at any time:
Updates to the lock duration should only apply to new users. Existing users should retain the lock duration set when they staked.
Changes to the APY should similarly affect only new users.
Add rewards for users to claim.

## Pre-requisites
1.node: v22.7.0 2.anchor: anchor-cli 0.30.1 3.cargo: cargo 1.82.0 4.solana: solana-cli 1.18.25 4.rustc: rustc 1.82.0

## Installation:
git clone https://github.com/pallavimatey/Staking-Solana-.git
anchor clean
cargo build

## Testing
Run tests with:
npx ts-node tests/t1.ts
npx ts-node tests/t2.ts

## Deployment
Deploy the program to Devnet:
anchor deploy