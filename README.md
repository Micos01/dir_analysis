--

  📊 Dir Analysis (Analisador de Diretórios)

  Uma ferramenta robusta para visualizar a ocupação de disco, identificar arquivos grandes e gerenciar listas de limpeza
  de forma visual e intuitiva.

  🚀 Como funciona?


  O fluxo de trabalho é dividido em duas etapas:
   1. Coleta: Um script leve gera um relatório de texto com a estrutura de pastas e tamanhos.
   2. Análise: A interface gráfica processa esse relatório para gerar gráficos, estatísticas e permitir a navegação
      profunda.

  ---


  🛠️ 1. Coleta de Dados (Legacy Systems / Shell)

  Para sistemas onde você não quer ou não pode instalar o binário, utilize o script abaixo para gerar o arquivo .txt
  necessário para a análise:


    1 find "Caminho/Da/Sua/Pasta" -type d | while read dir; do
    2     echo ""
    3     echo "$dir [$(du -sh "$dir" | cut -f1)]"
    4
    5     find "$dir" -maxdepth 1 -type f -exec du -ah {} + | awk '{
    6         size=$1;
    7         $1="";
    8         gsub(/^[ \t]+/, "", $0);
    9         n=split($0, a, "/");
   10         filename=a[n];
   11         printf "  [%8s] %s\n", size, filename
   12     }'
   13 done > relatório_arquivos.txt

  ---

  ✨ 2. O Analisador (Interface Visual)

  A aplicação construída com Tauri, React e Rust oferece:


   - Dashboard de Estatísticas: Veja o tamanho total, número de pastas e potencial de economia.
   - Gráficos Interativos: Visualização por barras dos maiores subdiretórios e arquivos.
   - Navegação de Pastas: Clique nos gráficos para entrar em subpastas e explorar seu conteúdo.
   - Busca Global: Filtre instantaneamente qualquer arquivo em toda a árvore mapeada.
   - Lista de Descarte: Selecione arquivos para remoção e exporte uma lista final de exclusão.
   - Drag & Drop: Basta arrastar o arquivo relatório_arquivos.txt para dentro da aplicação.

  ---

  📦 Desenvolvimento e Build


  Pré-requisitos
   - Node.js (https://nodejs.org/)
   - Rust (https://www.rust-lang.org/)
   - Tauri CLI (https://tauri.app/v1/guides/getting-started/prerequisites)

  Comandos


   1 # Instalar dependências
   2 npm install
   3
   4 # Rodar em modo desenvolvimento
   5 npm run tauri dev
   6
   7 # Gerar o executável (Build)
   8 npm run tauri build

  ---


  🛠️ Tecnologias Utilizadas
   - Frontend: React, TypeScript, Vite.
   - Gráficos: Recharts.
   - Ícones: Lucide React.
   - Backend: Rust (Tauri).
   - Estilização: CSS Moderno (Glassmorphism / Dark Mode support).

  ---


  Sugestões Adicionais para o seu README:
   1. Screenshots: Adicione imagens da interface (Dashboard, Gráficos).
   2. Licença: Se o projeto for aberto, adicione uma seção de licença (Ex: MIT).
   3. Download: Se você fizer o build, coloque um link para baixar o .exe ou .msi.

