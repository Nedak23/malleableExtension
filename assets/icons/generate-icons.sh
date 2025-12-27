#!/bin/bash
# Generate simple PNG icons using ImageMagick (if available)
# Or create placeholder SVG files

for size in 16 48 128; do
  if command -v convert &> /dev/null; then
    convert -size ${size}x${size} xc:'#0066cc' \
      -fill white -gravity center \
      -pointsize $((size/2)) -annotate 0 'M' \
      icon${size}.png
  else
    # Create a simple 1x1 PNG as placeholder (you'll want to replace these)
    printf '\x89PNG\r\n\x1a\n' > icon${size}.png
  fi
done

echo "Icons generated. Replace with proper branding icons."
