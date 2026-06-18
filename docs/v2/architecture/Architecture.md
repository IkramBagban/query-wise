so the stages inn the pipelines of user connecting a database and then asking questions and get top nothc answers. this arhitecture should work evne when 200, 300 hundred tables, and each table could have 40,50 columns. 
### User connects database 

when user connects a database then the entry will be created in databsae, and a job would be pushed to a queue. then a worker will pull the job. and then worker will process the job. 
- so we want to introduce a worker, so now there will be two apps, one is the current next.js one and other would be bun one, and we would use redis with bullmq. 
- there will be code which will first get all the tables and it's columns. and their datatypes. 
- then slowly slowly we will pass a batch of tables with columns to llm, and let llm generate one liner description for tables and each column. 
- also we will add their referenced tables as well. 
- and then embedding will be created for each table with their related data and stored in the vector db.
then other tables would be picked up. and keep processing
- and status in the db will keep updating in staged, from user connecting to last. 
after every table is processed. then we can let user query ver they want  

### User asks a query
- users asks a question. we will send some x previous chat history as well to llm. 
- it will understand the query and then llm will regenerate the prompt of user. 
- then converted into vector db. and we will get some 20,30 tables with their columns. 
- then we will pass this to an llm which will understand user's query and what they want. and then generate a plan. then an another llm will create the db qquery for it. 
- then we will validate the db query. and execute it. 
- then pass that returned data to an another llm which will explain it. 