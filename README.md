# Conecta Escola — versão ampliada

## Funcionalidades acrescentadas
- Registo de conta de escola e de aluno.
- A escola recebe um código; o aluno usa esse código para se associar à escola.
- Fotografia real no perfil (imagem comprimida no navegador antes de guardar).
- Publicações e comentários dentro da escola.
- Notícias privadas por escola.
- Aulas com disciplina e nome do professor.
- Diretório de funcionários: direção, professores, secretariado, limpeza, guardas, cantina e outros.
- Indicador de presença online/última atividade.
- Separação de alunos, conversas, turmas, notícias, aulas e funcionários por escola.

## Configuração obrigatória do Firebase
1. Abre `app.js` e substitui os valores `COLOCA_AQUI...` pelo Firebase config do teu projeto.
2. No Firebase Console, ativa Authentication > Email/Password.
3. Cria a base de dados Firestore.
4. Em Firestore Database > Rules, publica o conteúdo de `firestore.rules`.
5. Executa o projeto num servidor local (por exemplo, Live Server no VS Code).

## Como começar
1. Cria primeiro uma conta escolhendo **Escola** e indica o nome da instituição.
2. A aplicação apresenta um código da escola. Guarda-o e partilha-o apenas com os alunos autorizados.
3. Os alunos criam conta escolhendo **Aluno** e introduzem esse código.
4. A conta de escola pode publicar notícias, aulas e cadastrar funcionários.
5. Os alunos podem publicar textos, comentar e trocar mensagens dentro da sua escola.

## Notas importantes
- A fotografia de perfil é comprimida e guardada como imagem no Firestore. Para uso com muitos utilizadores, recomenda-se migrar as imagens para Firebase Storage.
- O indicador online é aproximado: atualiza quando a aplicação está visível e ao sair; o navegador pode não conseguir comunicar a saída em todos os casos.
- Esta versão ainda não inclui autenticação separada para cada funcionário nem painel de aprovação de alunos. O código de escola é o mecanismo de associação.
- Para segurança real, mantenha as regras do Firestore publicadas e não partilhe o código privado da escola publicamente.
