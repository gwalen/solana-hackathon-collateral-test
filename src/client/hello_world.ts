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
import BN from "bn.js";
import {url, urlTls} from './util/url';
import {Store} from './util/store';
import {newAccountWithLamports} from './util/new-account-with-lamports';

import {
  AccountLayout, AuthorityType,
  Token,
  TOKEN_PROGRAM_ID,
  u64
} from "@solana/spl-token";
import {sleep} from "./util/sleep";

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
const wrappedSolMintPubkey = new PublicKey('So11111111111111111111111111111111111111112');


/**
 * Client despising SOL to collateral program
 */
let clientAccount: Account; // client base account that will be used to send SOL to collateral-cap program (has to airdropped)
let clientCapTokenAccountPubkey: PublicKey;   // used to send CAP tokens to client after we pass SOL tokens to collateral-cap program
let clientWrappedSolAccountPubkey: PublicKey;   // used to send CAP tokens to client after we pass SOL tokens to collateral-cap program

/**
 * Collateral program id
 */
let programId: PublicKey;
let programCapTokenAccountPubkey: PublicKey;  // used as vault where program holds it's CAP tokens
let programCollateralInfoAccount: Account;   // used to send CAP tokens to client after we pass SOL tokens to collateral-cap program

const pathToProgram = 'dist/program/helloworld.so';

const payerIInitialSolAmount = 100

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
    payerAccount = await newAccountWithLamports(connection, payerIInitialSolAmount * LAMPORTS_PER_SOL);  // payer will have 10 SOL
  }
  // const secret = payerAccount.secretKey
  const lamports = await connection.getBalance(payerAccount.publicKey);
  console.log(
    'Payer for loading program account',
    payerAccount.publicKey.toBase58(),
    'containing',
    lamports / LAMPORTS_PER_SOL,
    'Sol to pay for fees',
  );
}


// main client account to which other are attached (wraped SOL and CAP token accounts)
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


export async function createClientWrappedSolAccount(): Promise<void> {
  const clientWrappedSolAccount = new Account();
  const balanceNeededForRent = await Token.getMinBalanceRentForExemptAccount(connection);
  const clientInitialSolBalance = 10 * 10**9;
  const createClientWrappedSolAccountIx = SystemProgram.createAccount({
    fromPubkey: payerAccount.publicKey,       //payer account
    newAccountPubkey: clientWrappedSolAccount.publicKey,
    lamports: clientInitialSolBalance + balanceNeededForRent,
    space: AccountLayout.span,
    programId: TOKEN_PROGRAM_ID
  });

  const createTokenAccountIx = Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      wrappedSolMintPubkey,
      clientWrappedSolAccount.publicKey,
      clientAccount.publicKey  // owner
  );

  clientWrappedSolAccountPubkey = clientWrappedSolAccount.publicKey

  const tx = new Transaction().add(createClientWrappedSolAccountIx, createTokenAccountIx);
  await connection.sendTransaction(tx, [payerAccount, clientWrappedSolAccount], {skipPreflight: false, preflightCommitment: 'singleGossip'});

  console.log("Wait for client SOL account create transaction")
  await sleep(1000);

  const token = new Token(
      connection,
      wrappedSolMintPubkey,
      TOKEN_PROGRAM_ID,
      payerAccount  // payer for fee
  );
  const tokens = await connection.getTokenAccountBalance(clientWrappedSolAccountPubkey);
  const clientWrappedSolAccountInfo = await token.getAccountInfo(clientWrappedSolAccountPubkey);
  console.log(
      'clientWrappedSolAccount',
      clientWrappedSolAccountPubkey.toBase58(),
      'containing',
      tokens.value.uiAmount,
      'wrapped Sol,',
      'owner',
      clientWrappedSolAccountInfo.owner.toBase58()
  );
}


export async function createCapMintAccount(): Promise<void> {
  if(!capMintAccountPubkey) {
    // payer here is an overlord we pays for everything he is in god mode, so mint authority is also on him
    capMintAccountPubkey = await createMintToken(payerAccount.publicKey, 9)
    console.log(`Crated capMintAccount with pub key: ${capMintAccountPubkey.toString()}`)
  }
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


export async function mintCapTokenForProgram(amount: number): Promise<void> {
  await mintToken(capMintAccountPubkey, programCapTokenAccountPubkey, amount)

  await sleep(1000);

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
    amount: number,
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
      amount * 10**9
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

  // Save this info for next time
  await store.save('config.json', {
    url: urlTls,
    programId: programId.toBase58()
  });
}


export async function callCollateralDepositSol(depositAmount: number): Promise<void> {
  const depositAmountSol = depositAmount * LAMPORTS_PER_SOL;
  const PDA = await PublicKey.findProgramAddress([Buffer.from("capCollateral")], programId);
  console.log(`Deposit sol : ${depositAmount} , calling program at ${programId.toBase58()}`);
  const instruction = new TransactionInstruction({
    keys: [
        {pubkey: clientAccount.publicKey, isSigner: true, isWritable: true},
        {pubkey: clientCapTokenAccountPubkey, isSigner: false, isWritable: true},
        {pubkey: programCollateralInfoAccount.publicKey, isSigner: false, isWritable: true},
        {pubkey: programCapTokenAccountPubkey, isSigner: false, isWritable: true},
        {pubkey: PDA[0], isSigner: false, isWritable: false},
        {pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId,
    // data: new Buffer("deposit"),
    data: Buffer.from(Uint8Array.of(0, ...new BN(depositAmountSol).toArray("le", 8)))
  });
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(instruction),
    // [payerAccount],
    [clientAccount],
    {
      commitment: 'singleGossip',
      preflightCommitment: 'singleGossip',
    },
  );
}

/**
 * Report the number of times the greeted account has been said hello to
 */
/*
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
 */

export async function createProgramCollateralInfoAccount(): Promise<void> {
  programCollateralInfoAccount = new Account();

  const createProgramCollateralInfoAccount = SystemProgram.createAccount({
    space: AccountLayout.span,  //TODO: where the value AccountLayout is declared
    lamports: await connection.getMinimumBalanceForRentExemption(AccountLayout.span, 'singleGossip'),
    fromPubkey: payerAccount.publicKey,  // payer account
    newAccountPubkey: programCollateralInfoAccount.publicKey,
    programId: programId
  });

  const tx = new Transaction().add(createProgramCollateralInfoAccount);
  await connection.sendTransaction(tx, [payerAccount, programCollateralInfoAccount], {skipPreflight: false, preflightCommitment: 'singleGossip'});

  await sleep(1000);

  const lamports = await connection.getBalance(programCollateralInfoAccount.publicKey);
  const accountInfo = await connection.getAccountInfo(programCollateralInfoAccount.publicKey);
  console.log(
      'programCollateralInfoAccount',
      programCollateralInfoAccount.publicKey.toBase58(),
      'containing',
      lamports / LAMPORTS_PER_SOL,
      'Sol to pay for rent',
  );
  console.log(`Owner of programCollateralInfoAccount : ${accountInfo?.owner.toBase58()}`)
  const isOwner = accountInfo?.owner.equals(programId)
  console.log(`Is program owner of programCollateralInfoAccount: ${isOwner}`)

}


export async function createClientCapTokenAccountPubkey(): Promise<void> {
  if(!clientCapTokenAccountPubkey) {
    clientCapTokenAccountPubkey = await createTokenAccount(capMintAccountPubkey, clientAccount.publicKey)
    console.log(`Crated clientCapTokenAccount with pub key: ${programCapTokenAccountPubkey.toString()}`)
  }
}


// based on : https://github.com/paul-schaaf/spl-token-ui/blob/ee7c32c9fd579f1e9f543981b8cad39d10a17d43/src/solana/token/index.ts
async function createTokenAccount(
    tokenMintPubkey: PublicKey,
    ownerPubkey: PublicKey
): Promise<PublicKey> {
  const token = new Token(
      connection,
      tokenMintPubkey,
      TOKEN_PROGRAM_ID,
      payerAccount  // payer for fee when creating this token account
  );

  console.log(`XXX Payer account: ${payerAccount.toString()}, token program id = ${TOKEN_PROGRAM_ID.toString()}, ownerPubKey: ${ownerPubkey} `)

  const newTokenAccount: PublicKey = await token.createAccount(ownerPubkey);
  return newTokenAccount;
}

/// NEW

/*
-- second version using just json Token ts libs

export async function createProgramCapTokenAccount(): Promise<void> {
  if(!programCapTokenAccountPubkey) {
    programCapTokenAccountPubkey = await createTokenAccount(capMintAccountPubkey, programId)
    console.log(`Crated programCapTokenAccount with pub key: ${programCapTokenAccountPubkey.toString()}`)
  }
}
*/

// -- first version using explicit transaction calls
/** this function is creating token assigned to Program but transfer this tokens inside the blockchain program we need to use PDA -
 * NOT USED NOW - left for future reference  */
export async function createProgramCapTokenAccount(): Promise<void> {
  const programCapTokenAccount = new Account();
  const balanceNeeded = await Token.getMinBalanceRentForExemptAccount(connection);
  const createProgramCapTokenAccountIx = SystemProgram.createAccount({
    fromPubkey: payerAccount.publicKey,  //payer account
    newAccountPubkey: programCapTokenAccount.publicKey,
    lamports: balanceNeeded,
    space: AccountLayout.span,
    programId: TOKEN_PROGRAM_ID
  });

  const createTokenAccountIx = Token.createInitAccountInstruction(
    TOKEN_PROGRAM_ID,
    capMintAccountPubkey,
    programCapTokenAccount.publicKey,
    programId
  );

  programCapTokenAccountPubkey = programCapTokenAccount.publicKey

  const tx = new Transaction().add(createProgramCapTokenAccountIx, createTokenAccountIx);
  await connection.sendTransaction(tx, [payerAccount, programCapTokenAccount], {skipPreflight: false, preflightCommitment: 'singleGossip'});

  console.log("Wait for init token transaction for ", programCapTokenAccountPubkey.toBase58())
  await sleep(2000);
  const accountInfo = await connection.getAccountInfo(programCapTokenAccountPubkey);
  console.log(`Crated programCapTokenAccount with pub key: ${programCapTokenAccountPubkey.toString()}`)
  console.log(`Owner of programCapTokenAccount : ${accountInfo?.owner.toBase58()}`)
  // This will be false bacuse owner of the account is it's creator which is token-program. But token account created by the
  // token program has in its data info about owner of the coin and amount of coins(tokens) on this token account.
  // the coin owner can be changed with using set_authority instruction (like in escrow program for temp_token_account)
  ////// let isOwner = accountInfo?.owner.equals(programId)
  ////// console.log(`Is program owner of programCapTokenAccount: ${isOwner}`)

  // but this will work as it will read the coin data of the token account
  const token = new Token(
      connection,
      capMintAccountPubkey,
      TOKEN_PROGRAM_ID,
      payerAccount  // payer for fee
  );
  const programCapTokenAccountInfo = await token.getAccountInfo(programCapTokenAccountPubkey);
  const isOwner = programCapTokenAccountInfo?.owner.equals(programId)
  console.log(`V2: Is program owner of coins on programCapTokenAccount: ${isOwner}, owner pub key : ${programCapTokenAccountInfo.owner.toBase58()}`)

}

export async function createPdaProgramCapTokenAccount(): Promise<void> {
  const PDA = await PublicKey.findProgramAddress([Buffer.from("capCollateral")], programId);
  programCapTokenAccountPubkey = await createTokenAccount(capMintAccountPubkey, PDA[0])
  console.log(`Crated programCapTokenAccount with pub key: ${programCapTokenAccountPubkey.toString()}`)
  await sleep(1000); // wait for token inti in the network  -- eventual consistency effect
  const token = new Token(
      connection,
      capMintAccountPubkey,
      TOKEN_PROGRAM_ID,
      payerAccount  // payer for fee
  );
  const programCapTokenAccountInfo = await token.getAccountInfo(programCapTokenAccountPubkey);
  const isOwner = programCapTokenAccountInfo?.owner.equals(PDA[0])
  console.log(`V3: Is Pda owner of coins on programCapTokenAccount: ${isOwner}, owner pub key : ${programCapTokenAccountInfo.owner.toBase58()}`)
}

