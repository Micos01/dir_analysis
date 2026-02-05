Para sistemas legados
utilize shell script para gerar o arquivo txt

find "Caminho/Da/Sua/Pasta" -type d | while read dir; do
    # 1. Imprime o caminho do diretório e o tamanho total dele entre colchetes
    echo ""
    echo "$dir [$(du -sh "$dir" | cut -f1)]"
    
    # 2. Lista os arquivos dentro desse diretório (sem entrar em subpastas)
    # Formata para mostrar o tamanho alinhado à esquerda com colchetes e o nome do arquivo
    find "$dir" -maxdepth 1 -type f -exec du -ah {} + | awk '{
        size=$1; 
        $1=""; 
        gsub(/^[ \t]+/, "", $0); 
        # Extrai apenas o nome do arquivo do caminho completo
        n=split($0, a, "/");
        filename=a[n];
        printf "  [%8s] %s\n", size, filename
    }'
done > relatório_arquivos.txt