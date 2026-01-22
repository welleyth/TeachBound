#!/bin/sh
cd /usr/share/teachbound-client || exit 1
exec python3 -m http.server 8080 --directory build
