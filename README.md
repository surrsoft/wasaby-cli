# test-cli
Приложение для запуска юнит тестов платформы. 
Результат тестов находится в папке application/artifacts

## Параметры
    branch - Ветка которую надо протестировать
    rc - Рц ветка 
    rep - Название репозитория по которому надо запустить тесты 
    store - Папка в которую будут клонироваться хранилища
    workDir - Папка в которой соберется сбоорка билдером по умолчанию application
    ports - Порты на которых запускать тест сервер  
    tasks - Задачи которые нужно выполнить, по умолчанию запускаются все три:    
        initStore - Клонирование и чекаут на нужные ветки хранилищ
        build - Сборка 
        startTest - Запуск тестов
    withBuilder - Разворот с помощью билдера, по умолчанию используется genie
    builderConfig - Путь к конфигу билдера, по умолчанию используется builderConfig.base.json из test-cli
    server - Запускает  сервер для юнитов, сами юниты не выполняются   
    only - Запускает тесты только для переданного репозитория, без зависимостей
    projectDir - Папка в которой лежит проект jinnee   
    builderCache - Папка с кешем для билдера
          
## Пример

node cli --branch=20.1000/bugfix/mergeable-options --rc=rc-20.1000 --rep=Types --withBuilder --only

## Запуск локально
1. Установите test-cli 
    npm install git+https://git.sbis.ru/sbis/test-cli.git#rc-20.1000 --save-dev
2. Соберите проект 
    node node_modules\test-cli\cli.js --tasks=initStore,build --builderConfig=./buildTemplate.json
3. Теперь можно запустить тесты
    node node_modules\test-cli\cli.js --tasks=startTest --rep=sbis3-controls --server --only 
