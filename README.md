# wasaby-cli
Приложение для запуска юнит тестов платформы. 

## Установка wasaby-cli
    
    npm install git+https://github.com/saby/wasaby-cli.git#rc-[version] --save-dev

## Установка необходимых репозиториев зависимостей
Репозитории для клонирования определяются по зависимостям модулей, описанных в s3mod файлах, начниная от модулей
юнит тестов, это модули в файле описания которых (s3mod) есть есть тег <unit_test/>. 

    npx wasaby-cli --tasks=initStore
    
РЦ ветка на которую переключатся все склонированные репозитории возьмется из параметра version, вашего pakage.json
если нужно обновить, какой либо репозитоий на специфическую ветку, то передаем параметр --[name]=my/branch, где [name]
надо заменить на название, нужного репозитория, его можно посмотреть в package.json файле, параметр [name](https://docs.npmjs.com/files/package.json#name). 
    
    npx wasaby-cli --tasks=initStore --rmi=my/branch     

## Cборка приложения
Приложение собирается через [wasaby-builder](https://github.com/saby/builder), в сборку попадают все зависимости 
модулей юнит тестов, это модули в файлах описания которых (*.s3mod) есть тег <unit_test/>. Поэтому важно следить и 
актуализировать зависимости ваших модулей.     
   
    npx wasaby-cli --tasks=build

По умолчанию проект собирается в папку application, это можно изменить, создав секцию wasaby-cli в package.json

    {
        "wasaby-cli": {
            "workDir": "path/to/application"    
        }
    }

Можно собрать приложения используя свой локальный репозиторий вместо того что скачан в store. Для этого необходимо 
передать путь до внешнего репозитория используя параметр --[name]=path/to/rep, где [name]
надо заменить на название, нужного репозитория, его можно посмотреть в package.json файле, параметр [name](https://docs.npmjs.com/files/package.json#name).  

    npx wasaby-cli --tasks=build --sbis-ws=../path/to/ws  
          
## Запуск юнит тестов
Юнит тесты ищутся в модулях у которых в файле описания(*.s3mod) есть тег <unit_test/>. Файлы содержащие 
юниты должны называться *.test.js 

* Запуск тестов под нодой

    * Отчет в консоли

            npx wasaby-cli --tasks=startTest --node --report=console
    
    * Отчет в файле, по умолчанию в папке application/artifacts    

            npx wasaby-cli --tasks=startTest --node
       
* Запуск тестов в браузере

    * Запустить сервер 
    
            npx wasaby-cli --tasks=startTest --server

    * Отчет в файле, по умолчанию в папке application/artifacts    
           
            npx wasaby-cli --tasks=startTest --browser
            
## Запуск демо стенда 
По умолчанию стенд запускается на 1024 порту, если он занят то запустится на другом свободном, в консоли 
будет ссылка http://localhost:[port]
    
    npx wasaby-cli --tasks=app

Порт, можно задать в package.json, но если он занят сервер запустится на другом свободном. 
     
    {
        "wasaby-cli": {
            "port": 777    
        }
    } 
        
## Подготовка окружения
Подготоваливает окружение: копирует tsConfig, esLint.
 
    npx wasaby-cli --tasks=prepare
        
При генерации tsConfig формируется секция path, туда добаляются модули из хранилища по умолчанию, если вы работаете с 
несколькими репозиториями одновременно то можно передать путь до вашего ропозитрия используя параметр --[name]=my/branch, 
где [name] надо заменить на название, нужного репозитория, его можно посмотреть в package.json файле, параметр [name](https://docs.npmjs.com/files/package.json#name).

    npx wasaby-cli --tasks=prepare --sbis3-ws=path/to/ws
        
## Параметры
Все параметры можно передавать как в командной строке через --, так и в секции wasaby-cli вашего package.json файла

* rc - рц ветка, по умолчанию берется из параметра version в package.json     
* rep - Название репозитория по которому надо запустить тесты, параметр name в package.json  
* store - Папка в которую будут клонироваться хранилища
* workDir - Папка в которой соберется сбоорка билдером по умолчанию application
* tasks - Задачи которые нужно выполнить:    
    * initStore - Клонирование и чекаут на нужные ветки хранилищ
    * build - Сборка приложения
    * startTest - Запуск тестов
    * app - Запуск демо стенда
* server - Запускает сервер для юнитов, сами юниты не выполняются   
* only - Запускает тесты только для переданного репозитория, без зависимостей
* project - Путь до проекта jinnee *.s3cld   
* builderCache - Папка с кешем для билдера
* coverage - Сгенерировать отчет покрытия
