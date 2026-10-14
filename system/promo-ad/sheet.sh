cd "$1/mock"; FF="$2"
for n in square vertical wide; do fs=$(ls $n-*.png | sort -t- -k2 -n); args=""; for f in $fs; do args="$args -i $f"; done
 if [ $n = wide ]; then sc=640:360; elif [ $n = vertical ]; then sc=300:533; else sc=400:400; fi
 fc=""; i=0; for f in $fs; do fc="$fc[$i]scale=$sc[v$i];"; i=$((i+1)); done
 $FF -nostdin -v error -y $args -filter_complex "${fc}[v0][v1][v2][v3][v4][v5][v6][v7][v8]xstack=inputs=9:layout=0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0|0_h0+h3|w0_h0+h3|w0+w1_h0+h3" sheet-$n.jpg
done
