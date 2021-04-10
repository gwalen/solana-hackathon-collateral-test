use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
    sysvar::{rent::Rent, Sysvar},
};

use spl_token::state::Account as TokenAccount;

// use crate::{error::EscrowError, instruction::CappuccinoInstruction, state::Escrow};
use crate::{instruction::CappuccinoInstruction};


//TODO: ask what if I would decalre a bigger sturcture like map inside a program body not in account data

pub struct Processor;
impl Processor {

    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = CappuccinoInstruction::unpack(instruction_data)?;

        msg!("Process instruction");

        match instruction {
            CappuccinoInstruction::DepositSolForCap { amount } => {
                msg!("Instruction: DepositSolForCap");
                Self::deposit_sol_for_cap(accounts, amount, program_id)
            }
            CappuccinoInstruction::CheckCollaterals => {
                msg!("Instruction: CheckCollaterals: not implemented");
                Ok(())
            }
        }
    }

    fn deposit_sol_for_cap(
        accounts: &[AccountInfo],
        amount_sol: u64,
        program_id: &Pubkey,
    ) -> ProgramResult {

        const COLLATERAL_RATIO: f64 = 2.0; // 200%
        const TEN_POW_NINE: u64 = 1000000000;

        let account_info_iter = &mut accounts.iter();

        // input data
        let client_account = next_account_info(account_info_iter)?;
        let client_cap_account = next_account_info(account_info_iter)?;  // TODO: create it during this transaction https://spl.solana.com/associated-token-account
        let client_sol_account = next_account_info(account_info_iter)?;
        let collateral_info_account = next_account_info(account_info_iter)?;
        let collateral_cap_account = next_account_info(account_info_iter)?;
        let collateral_sol_account = next_account_info(account_info_iter)?;
        // let rent = &Rent::from_account_info(next_account_info(account_info_iter)?)?; //TODO: not used yet
        let pda_account = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;

        let (pda, nonce) = Pubkey::find_program_address(&[b"capCollateral"], program_id);

        // initial validations
        if !client_account.is_signer {   // client must be the signer of deposit transaction
            msg!("Client must be a signer of a signer of transaction");
            return Err(ProgramError::MissingRequiredSignature);
        }

        if *collateral_info_account.owner != *program_id {  // program must own collateral account to make changes to its data
            msg!("Collateral info account must belong to program");
            return Err(ProgramError::IncorrectProgramId);
        }

        if *pda_account.key != pda {
            msg!("Passed pda_account key not equal to generated pda pub key");
            return Err(ProgramError::IncorrectProgramId);
        }

        msg!("Send SOL from client to program {} ", amount_sol);
        let transfer_sol_to_program_ix = spl_token::instruction::transfer(
            token_program.key,
            client_sol_account.key,
            collateral_sol_account.key,
            client_account.key,    // here client is the signer
            &[&client_account.key],
            amount_sol,
        )?;
        msg!("Calling the token program to transfer SOL tokens from client to collateral program sol amount (mul 10^9) = {}", amount_sol);
        invoke(
            &transfer_sol_to_program_ix,
                &[
                client_account.clone(),
                client_sol_account.clone(),
                collateral_sol_account.clone(),
                token_program.clone(),
            ],
        )?;

        //TODO: below fails on solana blockchain complaining that there is no round function : failed to complete: ELF error: Unresolved symbol (round) at instruction #716 (ELF file offset 0x1578)
        // let client_collateralized_cap: u64 = (amount_sol as f64 / COLLATERAL_RATIO).round() as u64;
        let client_collateralized_cap: u64 = 1 * TEN_POW_NINE; // tmp just for testing
        msg!("Send {} cap to client", client_collateralized_cap);
        let transfer_cap_to_client_ix = spl_token::instruction::transfer(
            token_program.key,
            collateral_cap_account.key,
            client_cap_account.key,
            &pda,    // TODO: here pda is the signer
            &[&pda],
            client_collateralized_cap,
        )?;
        msg!("Calling the token program to transfer CAP tokens from collateral program to client cap amount (mul 10^9) = {}", client_collateralized_cap);
        invoke_signed(
            &transfer_cap_to_client_ix,
                &[
                collateral_cap_account.clone(),
                client_cap_account.clone(),
                pda_account.clone(),
                token_program.clone(),
            ],
            &[&[&b"capCollateral"[..], &[nonce]]],
        )?;

        Ok(())
    }

}
