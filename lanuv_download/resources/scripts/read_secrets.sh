#!/bin/bash

set -e 

# Load envs
file_env() {
	local var="$1"
	local fileVar="${var}_FILE"
	local def="${2:-}"
	if [ "${!var:-}" ] && [ "${!fileVar:-}" ]; then
		echo >&2 "error: both $var and $fileVar are set (but are exclusive)"
		exit 1
	fi
	local val="$def"
	if [ "${!var:-}" ]; then
		val="${!var}"
	elif [ "${!fileVar:-}" ]; then
		val="$(< "${!fileVar}")"
	fi
	#echo "$var,$val"
	export "$var"="$val"
	unset "$fileVar" 
}


#Read docker secrets. 
secrets=(
    APP_PASSWORD
)

for e in "${secrets[@]}"; do
		file_env "$e"
done

#Ensure mandatory environment vars are set  
envs=(
    APP_PASSWORD
)

for e in "${envs[@]}"; do
	if [ -z ${!e:-} ]; then
		echo "error: $e is not set"
		exit 1
	fi
done

crond -f