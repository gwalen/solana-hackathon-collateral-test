/**
 * Hello world
 */

import {
  establishConnection,
  createInitialPayerAccount,
  createProgramCollateralInfoAccount,
  createCapMintAccount,
  createProgramCapTokenAccount,
  createClientAccount,
  createClientCapTokenAccountPubkey,
  loadProgram,
  sayHello,
  reportHellos,
  mintCapTokenForProgram,
} from './hello_world';
import {u64} from "@solana/spl-token";

async function main() {
  console.log("Let's say hello to a Solana account...");

  // Establish connection to the cluster
  await establishConnection();

  // Determine who pays for the fees
  await createInitialPayerAccount();

  const initialCapTokenAmount = u64.fromBuffer(Buffer.from('10'));
  // const initialCapTokenAmount = u64.fromBuffer(Buffer.from([100]));
  console.log(`XXX initialCapTokenAmount = ${initialCapTokenAmount.toString()}`)

  await createProgramCollateralInfoAccount()
  await createCapMintAccount() // TODO: how to send and mint tokens using that account ?
  await createProgramCapTokenAccount()
  await mintCapTokenForProgram(initialCapTokenAmount)
  await createClientAccount()
  await createClientCapTokenAccountPubkey()

  // Load the program if not already loaded
  await loadProgram();

  // Say hello to an account
  // await sayHello();

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
