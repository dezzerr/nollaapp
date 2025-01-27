#!/bin/bash

# Create backup of original files
cp nollaapp/appnolla1.py nollaapp/appnolla1.py.bak

# Move new files into place
mv nollaapp/openai_init.py nollaapp/openai_init.py.new
mv nollaapp/openai_functions.py nollaapp/openai_functions.py.new
mv nollaapp/app_new.py nollaapp/appnolla1.py

# Make the script executable
chmod +x update_openai.sh
