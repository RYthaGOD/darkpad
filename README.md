# Private Darkpool Launchpad

A bot-resistant token launchpad on Solana using **Noir ZK proofs** for private participation and **Token-2022** for yield-bearing wrapped assets.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER JOURNEY                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. SHIELD          2. BID (DARK)        3. CLAIM               │
│   ┌─────────┐       ┌─────────────┐      ┌─────────┐            │
│   │ JitoSOL │ ───►  │ Noir Proof  │ ───► │ Tokens  │            │
│   │   ↓     │       │     +       │      │   or    │            │
│   │ cJitoSOL│       │ Commit Bid  │      │ Refund  │            │
│   └─────────┘       └─────────────┘      └─────────┘            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
launchpad/
├── programs/
│   ├── shield/           # JitoSOL <-> cJitoSOL wrapper
│   └── launchpad/        # Darkpool auction logic
├── circuits/
│   └── check_eligibility/ # Noir ZK circuit for anonymous whitelist
├── scripts/
│   └── mint-mock-jito.ts  # Test token creation
└── tests/
```

## Key Technologies

- **Noir** (https://noir-lang.org) - ZK circuit for anonymous whitelist membership
- **Anchor** - Solana program framework
- **Token-2022** - Next-gen SPL token standard with extensions

## Getting Started

### Prerequisites

```bash
# Install Noir
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup

# Install Solana & Anchor
sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install latest && avm use latest
```

### Build

```bash
# Build Noir circuits
cd circuits/check_eligibility && nargo compile

# Build Solana programs
anchor build
```

### Test

```bash
# Test Noir circuits
cd circuits/check_eligibility && nargo test

# Test Solana programs
anchor test
```

## Privacy Model

1. **Identity Privacy**: Users prove whitelist membership via Merkle proof without revealing their wallet address
2. **Bid Privacy (V1)**: Bids are committed as `Hash(amount + salt)` - revealed after auction
3. **Nullifier**: `Hash(secret + auction_id)` prevents double-bidding while preserving anonymity

## License

MIT
