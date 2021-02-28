/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/ban-ts-comment */

import {
  Account,
  Connection,
  BpfLoader,
  BPF_LOADER_PROGRAM_ID,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import fs from 'mz/fs';

// @ts-ignore
import BufferLayout from 'buffer-layout';

import {url, urlTls} from './util/url';
import {Store} from './util/store';
import {newAccountWithLamports} from './util/new-account-with-lamports';

import {
  Token,
  TOKEN_PROGRAM_ID
} from "@solana/spl-token";

/**
 * Connection to the network
 */
let connection: Connection;

/**
 * Pays for loading the collateral-cap program
 */
let payerAccount: Account;

/**
 * Accounts below have to be manually created (these are min accounts for CAP)
 */

let clientAccount: Account; // client base account that will be used to send SOL to collateral-cap program (has to airdropped)
// let capMintAccount: Account;  -- not needed here but has to be manually created and send CAP tokens to programCapTokenAccount
let programCapTokenAccount: PublicKey;  // used as vault where program holds it's CAP tokens
let clientCapTokenAccount: PublicKey;   // used to send CAP tokens to client after we pass SOL tokens to collateral-cap program
let programCollateralInfoAccount: Account;   // used to send CAP tokens to client after we pass SOL tokens to collateral-cap program



/**
 * Hello world's program id
 */
let programId: PublicKey;

/**
 * The public key of the account we are saying hello to
 */
let greetedPubkey: PublicKey;

const pathToProgram = 'dist/program/helloworld.so';

/**
 * Layout of the greeted account data
 */
const greetedAccountDataLayout = BufferLayout.struct([
  BufferLayout.u32('numGreets'),
]);

/**
 * Establish a connection to the cluster
 */
export async function establishConnection(): Promise<void> {
  connection = new Connection(url, 'singleGossip');
  const version = await connection.getVersion();
  console.log('Connection to cluster established:', url, version);
}

/**
 * Establish an account to pay for everything
 */
export async function createInitialPayerAccount(): Promise<void> {
  if (!payerAccount) {
    payerAccount = await newAccountWithLamports(connection, 10 * LAMPORTS_PER_SOL);  // payer will have 10 SOL
  }

  const lamports = await connection.getBalance(payerAccount.publicKey);
  console.log(
    'Payer for loading program account',
    payerAccount.publicKey.toBase58(),
    'containing',
    lamports / LAMPORTS_PER_SOL,
    'Sol to pay for fees',
  );
}

export async function createProgramCollateralInfoAccount(): Promise<void> {
  if (!programCollateralInfoAccount) {
    programCollateralInfoAccount = await newAccountWithLamports(connection, 5 * LAMPORTS_PER_SOL);  // some sol so the account can pay it's rent
  }

  const lamports = await connection.getBalance(programCollateralInfoAccount.publicKey);
  console.log(
      'programCollateralInfoAccount ',
      payerAccount.publicKey.toBase58(),
      'containing',
      lamports / LAMPORTS_PER_SOL,
      'Sol to pay for rent',
  );
}

export async function createTokenAccount(
    feePayer: string,
    tokenMintAddress: string,
    owner: string
): Promise<PublicKey> {
  const tokenMintPubkey = new PublicKey(tokenMintAddress);
  const ownerPubkey = new PublicKey(owner);

    const token = new Token(
        connection,
        tokenMintPubkey,
        TOKEN_PROGRAM_ID,
        payerAccount  // payer for fee when creating this token account
    );

    const newTokenAccount: PublicKey = await token.createAccount(ownerPubkey);
    return newTokenAccount;
}


/**
 * Load the hello world BPF program if not already loaded
 */
export async function loadProgram(): Promise<void> {
  const store = new Store();

  // Check if the program has already been loaded
  try {
    const config = await store.load('config.json');
    programId = new PublicKey(config.programId);
    greetedPubkey = new PublicKey(config.greetedPubkey);
    await connection.getAccountInfo(programId);
    console.log('Program already loaded to account', programId.toBase58());
    return;
  } catch (err) {
    // try to load the program
  }

  // Load the program
  console.log('Loading collateral-cap program...');
  const data = await fs.readFile(pathToProgram);
  const programAccount = new Account();
  await BpfLoader.load(
    connection,
    payerAccount,
    programAccount,
    data,
    BPF_LOADER_PROGRAM_ID,
  );
  programId = programAccount.publicKey;
  console.log('Program loaded to account', programId.toBase58());

  // Create the greeted account
  const greetedAccount = new Account();
  greetedPubkey = greetedAccount.publicKey;
  console.log('Creating account', greetedPubkey.toBase58(), 'to say hello to');
  const space = greetedAccountDataLayout.span;
  const lamports = await connection.getMinimumBalanceForRentExemption(
    greetedAccountDataLayout.span,
  );
  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payerAccount.publicKey,
      newAccountPubkey: greetedPubkey,
      lamports,
      space,
      programId,
    }),
  );
  await sendAndConfirmTransaction(
    connection,
    transaction,
    [payerAccount, greetedAccount],
    {
      commitment: 'singleGossip',
      preflightCommitment: 'singleGossip',
    },
  );

  // Save this info for next time
  await store.save('config.json', {
    url: urlTls,
    programId: programId.toBase58(),
    greetedPubkey: greetedPubkey.toBase58(),
  });
}

/**
 * Say hello
 */
export async function sayHello(): Promise<void> {
  console.log('Saying hello to', greetedPubkey.toBase58());
  const instruction = new TransactionInstruction({
    keys: [{pubkey: greetedPubkey, isSigner: false, isWritable: true}],
    programId,
    data: Buffer.alloc(0), // All instructions are hellos
  });
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(instruction),
    [payerAccount],
    {
      commitment: 'singleGossip',
      preflightCommitment: 'singleGossip',
    },
  );
}

/**
 * Report the number of times the greeted account has been said hello to
 */
export async function reportHellos(): Promise<void> {
  const accountInfo = await connection.getAccountInfo(greetedPubkey);
  if (accountInfo === null) {
    throw 'Error: cannot find the greeted account';
  }
  const info = greetedAccountDataLayout.decode(Buffer.from(accountInfo.data));
  console.log(
    greetedPubkey.toBase58(),
    'has been greeted',
    info.numGreets.toString(),
    'times',
  );
}
