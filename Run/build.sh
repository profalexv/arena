#!/usr/bin/env bash
# Script de build para o Render.com

# Para o script se um comando falhar
set -o errexit

echo "Iniciando o processo de build..."

# Instala as dependências definidas no package.json de forma otimizada para CI/CD
npm install --ci

echo "Build finalizado com sucesso."