use solana_program::{
    program_error::ProgramError,
    msg
};
use std::convert::TryInto;
use std::str::from_utf8;

// use crate::error::EscrowError::InvalidInstruction;

pub enum CappuccinoInstruction {

    /// Deposits SOL tokens as collateral and return CAP tokens
    /// Accounts expected:
    /// 0. `[signer]` The account of the person depositing SOL for CAP
    /// 1. `[]` The client's CAP token account for the token he will receive for SOL
    /// 2. `[writable]` The collateral info account, it holds all info about existing collaterals.
    /// 3. `[writable]` The CAP program account, it holds CAP tokens which program is transferring to the user for his SOL tokens.
    /// 4. `[]` The rent sysvar  //TODO: ???
    /// 5. `[]` The token program
    DepositSolForCap {
    ///number of SOL coins to transfer
        amount: u64,
    },
    ///  Check existing collateral positions and liquidate if necessary
    ///
    ///
    /// Accounts expected:
    /// TODO
    CheckCollaterals,
}

impl CappuccinoInstruction {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        let (tag, rest) = input.split_first().ok_or(ProgramError::InvalidArgument)?;

        let function_name = from_utf8(input).map_err(|err| {
            msg!("Invalid UTF-8, from byte {}", err.valid_up_to());
            ProgramError::InvalidInstructionData // TODO: own error wrong instruction type
        })?;

        Ok(match function_name {
            "deposit" => Self::DepositSolForCap {
                amount: Self::unpack_amount(rest)?,
            },
            "check_collaterals" => Self::CheckCollaterals,
            _ => return Err(ProgramError::InvalidArgument.into()), //TODO: what into() is doing ?
        })
    }

    fn unpack_amount(input: &[u8]) -> Result<u64, ProgramError> {
        let amount = input
            .get(..8)
            .and_then(|slice| slice.try_into().ok())
            .map(u64::from_le_bytes)
            // .ok_or(InvalidInstruction)?; //TODO: declare own errors
            .ok_or(ProgramError::InvalidArgument)?;
        Ok(amount)
    }
}
