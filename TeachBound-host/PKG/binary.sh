#!/bin/sh
CONFIG_DIR="$HOME/.config/teachbound-host"
ENV_FILE="$CONFIG_DIR/.env"

mkdir -p "$CONFIG_DIR"

# generate .env only if missing
if [ ! -f "$ENV_FILE" ]; then
    cd /usr/share/teachbound-host || exit 1
    # generate to temporary file
    TMP_ENV="$(mktemp)"
    node src/generate_seed.js > "$TMP_ENV"
    mv "$TMP_ENV" "$ENV_FILE"
fi

# run Node host using user's .env
cd /usr/share/teachbound-host || exit 1
node -r dotenv/config src/host.js dotenv_config_path="$ENV_FILE"
