#!/bin/bash
# Create simple placeholder icons using ImageMagick (if available)
# Otherwise, these will need to be created manually

if command -v convert &> /dev/null; then
  # Create simple VS Code blue icons with white "VS"
  convert -size 16x16 xc:'#007acc' -pointsize 8 -fill white -gravity center -annotate +0+0 'VS' icon16.png
  convert -size 48x48 xc:'#007acc' -pointsize 24 -fill white -gravity center -annotate +0+0 'VS' icon48.png
  convert -size 128x128 xc:'#007acc' -pointsize 64 -fill white -gravity center -annotate +0+0 'VS' icon128.png
  echo "Icons created successfully"
else
  echo "ImageMagick not installed. Please create icons manually:"
  echo "- icon16.png (16x16)"
  echo "- icon48.png (48x48)"
  echo "- icon128.png (128x128)"
fi
