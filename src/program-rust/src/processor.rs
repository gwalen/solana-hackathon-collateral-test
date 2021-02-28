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

        //TODO: how to declare program constants in solana
        const COLLATERAL_RATIO: f64 = 2.0; // 200% //TODO: move to constants of the program (if possible ?, best keep it in collateral_info account)

        let account_info_iter = &mut accounts.iter();

        // input data
        let client_account = next_account_info(account_info_iter)?;
        let client_cap_account = next_account_info(account_info_iter)?;  // TODO: create it during this transaction https://spl.solana.com/associated-token-account
        let collateral_info_account = next_account_info(account_info_iter)?;
        let collateral_cap_account = next_account_info(account_info_iter)?;
        // let rent = &Rent::from_account_info(next_account_info(account_info_iter)?)?; //TODO: not used yet
        let token_program = next_account_info(account_info_iter)?;

        // initial validations
        if !client_account.is_signer {   // client must be the signer of deposit transaction
            msg!("Client must be a signer of a signer of transaction");
            return Err(ProgramError::MissingRequiredSignature);
        }

        if *collateral_info_account.owner != *program_id {  // program must own collateral account to make changes to its data
            msg!("Collateral info account must belong to program");
            return Err(ProgramError::IncorrectProgramId);
        }

        if *collateral_cap_account.owner != *program_id {  // program must own a CAP account used to distribute CAP to clients
            msg!("Cap account must belong to program");
            return Err(ProgramError::IncorrectProgramId);
        }

        // let escrow_account = next_account_info(account_info_iter)?;

        // if !rent.is_exempt(escrow_account.lamports(), escrow_account.data_len()) {
        //     return Err(EscrowError::NotRentExempt.into());
        // }
        // let mut escrow_info = Escrow::unpack_unchecked(&escrow_account.data.borrow())?;  //TODO
        // if escrow_info.is_initialized() {
        //     return Err(ProgramError::AccountAlreadyInitialized);
        // }
        // escrow_info.is_initialized = true;
        // escrow_info.initializer_pubkey = *client_account.key;
        // escrow_info.temp_token_account_pubkey = *cap_token_mint_account.key;
        // escrow_info.initializer_token_to_receive_account_pubkey = *token_to_receive_account.key;
        // escrow_info.expected_amount = amount_sol;
        //
        // Escrow::pack(escrow_info, &mut escrow_account.data.borrow_mut())?;
        // let (pda, _nonce) = Pubkey::find_program_address(&[b"escrow"], program_id);


        // Transfer SOL from client to program
        let transfer_sol_to_program_ix = spl_token::instruction::transfer(
            token_program.key,
            client_account.key,
            collateral_cap_account.key,
            client_account.key, // TODO: here program is the signer
            &[&client_account.key],
            amount_sol,
        )?;
        //TODO: remove amount sol from log message as it it expensive op
        msg!("Calling the token program to transfer SOL tokens from client to collateral program sol amount = {}", amount_sol);
        invoke(
            &transfer_sol_to_program_ix,
                &[
                client_account.clone(),
                collateral_cap_account.clone(),
                token_program.clone(),
            ],
        )?;

        //TODO: if it's sol maybe we just use this : and no token transaction is necessary ?
        // Withdraw five lamports from the source - but program is not owner of that account ?
        // **client_account.try_borrow_mut_lamports()? -= 5;

        // Transfer CAP from program to client
        let client_collateralized_cap: u64 = (amount_sol as f64 / COLLATERAL_RATIO).round() as u64;
        msg!("Send {} cap to client", client_collateralized_cap);
        // let transfer_cap_to_client_ix = spl_token::instruction::transfer(
        //     token_program.key,
        //     collateral_cap_account.key,
        //     client_cap_account.key,
        //     &pda,
        //     &[&pda],
        //     client_collateralized_cap,
        // )?;
        // msg!("Calling the token program to transfer tokens to the taker...");
        // invoke_signed(  //TODO : difference between invoke and invoke_signed
        //     &transfer_cap_to_client_ix,
        //                 &[
        //         pdas_temp_token_account.clone(),
        //         collateral_cap_account.clone(),
        //         client_cap_account.clone(),
        //         token_program.clone(),
        //     ],
        //                 &[&[&b"escrow"[..], &[nonce]]],
        // )?;

        Ok(())
    }

}
