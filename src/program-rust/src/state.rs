use solana_program::{
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey
};

use arrayref::{array_mut_ref, array_refs, mut_array_refs};

use std::collections::HashMap;

pub struct CollateralData {
    pub is_initialized: bool,
    pub initializer_pubkey: Pubkey,
    pub collaterals: HashMap<str, bool>
}

impl Sealed for CollateralData {}

impl isInitalized for CollateralData {
    fn is_initialized(&self) -> bool { self.is_initialized }
}

