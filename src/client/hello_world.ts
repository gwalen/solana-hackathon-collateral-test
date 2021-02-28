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
  TOKEN_PROGRAM_ID, u64
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
 * CAP token mint account
 */

let capMintAccountPubkey: PublicKey;  // -- not needed here but has to be manually created and send CAP tokens to programCapTokenAccount

/**
 * Client despising SOL to collateral program
 */
let clientAccount: Account; // client base account that will be used to send SOL to collateral-cap program (has to airdropped)
let clientCapTokenAccountPubkey: PublicKey;   // used to send CAP tokens to client after we pass SOL tokens to collateral-cap program
//TODO: client wrapped SOl account so we can do transactions using SPL token API

/**
 * Collateral program id
 */
let programId: PublicKey;
let programCapTokenAccountPubkey: PublicKey;  // used as vault where program holds it's CAP tokens
let programCollateralInfoAccount: Account;   // used to send CAP tokens to client after we pass SOL tokens to collateral-cap program

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
      'programCollateralInfoAccount',
      programCollateralInfoAccount.publicKey.toBase58(),
      'containing',
      lamports / LAMPORTS_PER_SOL,
      'Sol to pay for rent',
  );
}

export async function createClientAccount(): Promise<void> {
  if (!clientAccount) {
    clientAccount = await newAccountWithLamports(connection, 10 * LAMPORTS_PER_SOL);  // client main account ( with pure SOL)
  }

  const lamports = await connection.getBalance(programCollateralInfoAccount.publicKey);
  console.log(
      'clientAccount',
      clientAccount.publicKey.toBase58(),
      'containing',
      lamports / LAMPORTS_PER_SOL,
      'Sol on main client account',
  );
}

export async function createCapMintAccount(): Promise<void> {
  if(!capMintAccountPubkey) {
    // payer here is an overlord we pays for everything he is in god mode, so mint authority is also on him
    capMintAccountPubkey = await createMintToken(payerAccount.publicKey, 9)
    console.log(`Crated capMintAccount with pub key: ${capMintAccountPubkey.toString()}`)
  }
}

export async function createProgramCapTokenAccount(): Promise<void> {
  if(!programCapTokenAccountPubkey) {
    programCapTokenAccountPubkey = await createTokenAccount(capMintAccountPubkey, programId)
    console.log(`Crated programCapTokenAccount with pub key: ${programCapTokenAccountPubkey.toString()}`)
  }
}

export async function createClientCapTokenAccountPubkey(): Promise<void> {
  if(!clientCapTokenAccountPubkey) {
    clientCapTokenAccountPubkey = await createTokenAccount(capMintAccountPubkey, clientAccount.publicKey)
    console.log(`Crated programCapTokenAccount with pub key: ${programCapTokenAccountPubkey.toString()}`)
  }
}


export async function createTokenAccount(
    tokenMintPubkey: PublicKey,
    ownerPubkey: PublicKey
): Promise<PublicKey> {
    const token = new Token(
        connection,
        tokenMintPubkey,
        TOKEN_PROGRAM_ID,
        payerAccount  // payer for fee when creating this token account
    );

    const newTokenAccount: PublicKey = await token.createAccount(ownerPubkey);
    return newTokenAccount;
}

export async function createMintToken(
    mintAuthority: PublicKey,
    decimals: number,
): Promise<PublicKey> {
  const token = await Token.createMint(
      connection,
      payerAccount,
      mintAuthority,
      null,  // freezeAuthority ? new PublicKey(freezeAuthority) : null,
      decimals,
      TOKEN_PROGRAM_ID
  );
  return token.publicKey;
}


export async function mintCapTokenForProgram(amount: u64): Promise<void> {
  await mintToken(capMintAccountPubkey, programCapTokenAccountPubkey, amount)

  const tokens = await connection.getTokenAccountBalance(programCapTokenAccountPubkey);
  console.log(
      `Collateral program token account`,
      programCapTokenAccountPubkey.toBase58(),
      'containing',
      tokens,
      'CAP tokens',
  );

}


async function mintToken (
    tokenMintPubkey: PublicKey,
    destinationPubkey: PublicKey,
    amount: u64,
): Promise<void> {

  const token = new Token(
      connection,
      tokenMintPubkey,
      TOKEN_PROGRAM_ID,
      payerAccount
  );

  await token.mintTo(
      destinationPubkey,
      payerAccount,  // payer account has mint authority
      [],
      amount
  );
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
