use solana_program::{
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey
};

use arrayref::{array_mut_ref, array_refs, mut_array_refs};

use std::collections::HashMap;

//TODO: work with fixed size od hash map like here : https://github.com/Arrowana/solanalotto/blob/main/program/src/state.rs
// look in solona-program-library using borsh : https://github.com/solana-labs/solana-program-library/blob/58807c5f8b9114545080ff4d1f98899246308ffc/record/program/src/state.rs

pub struct CollateralData {
    pub is_initialized: bool,
    pub initializer_pubkey: Pubkey,
    pub collaterals: HashMap<str, bool>
}

impl Sealed for CollateralData {}

impl isInitalized for CollateralData {
    fn is_initialized(&self) -> bool { self.is_initialized }
}

