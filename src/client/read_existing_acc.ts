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
    AccountLayout,
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
 * Establish a connection to the cluster
 */
export async function establishConnection(): Promise<void> {
    connection = new Connection(url, 'singleGossip');
    const version = await connection.getVersion();
    console.log('Connection to cluster established:', url, version);
}

export async function printAccountInfo(account: PublicKey): Promise<void> {
    const accountInfo = await connection.getAccountInfo(account)
    
    console.log(`Owner of account : ${accountInfo?.owner.toBase58()}`)
}