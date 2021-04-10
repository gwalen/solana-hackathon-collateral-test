/**
 * Hello world
 */

import {
  establishConnection,
  createInitialPayerAccount,
  createProgramCollateralInfoAccount,
  createCapMintAccount,
  createProgramCapTokenAccount,
  createPdaProgramCapTokenAccount,
  createClientAccount,
  createClientCapTokenAccountPubkey,
  loadProgram,
  callCollateralDepositSol,
  reportHellos,
  mintCapTokenForProgram,
  createClientWrappedSolAccount
} from './hello_world';
import {u64} from "@solana/spl-token";

async function main() {
  console.log("Let's say hello to a Solana account...");

  // Establish connection to the cluster
  await establishConnection();

  // Determine who pays for the fees
  await createInitialPayerAccount();

  const initialCapTokenAmount = 100;

  // Load the program if not already loaded
  await loadProgram();

  await createProgramCollateralInfoAccount()
  await createCapMintAccount() // TODO: how to send and mint tokens using that account ?
  // await createProgramCapTokenAccount()
  await createPdaProgramCapTokenAccount()
  await mintCapTokenForProgram(initialCapTokenAmount)
  await createClientAccount()
  await createClientWrappedSolAccount()
  await createClientCapTokenAccountPubkey()


  // deposit sol
  await callCollateralDepositSol(1);

  // Find out how many times that account has been greeted
  // await reportHellos();

  console.log('Success');
}

main().then(
  () => process.exit(),
  err => {
    console.error(err);
    process.exit(-1);
  },
);
