#!/bin/bash

echo "🚀 Pushing to GitHub..."
echo ""
echo "You'll be prompted for credentials:"
echo "  Username: rufusunboxed"
echo "  Password: [Use a Personal Access Token - see instructions below]"
echo ""
echo "📝 To create a Personal Access Token:"
echo "  1. Go to: https://github.com/settings/tokens"
echo "  2. Click 'Generate new token' → 'Generate new token (classic)'"
echo "  3. Name it: 'Pushup Tracker Push'"
echo "  4. Select scope: 'repo' (full control of private repositories)"
echo "  5. Click 'Generate token'"
echo "  6. Copy the token (you won't see it again!)"
echo ""
echo "When prompted for password, paste the token (not your GitHub password)"
echo ""
read -p "Press Enter when you have your token ready..."

git push -u origin main

