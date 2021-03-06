'use strict';

angular.module('RTPoll.controllers', [])
    .controller('LoginCtrl', function (Backand, $state, $rootScope, LoginService, $ionicPopup, $ionicHistory, $log) {
        var login = this;
        login.user = 'Anonymous';

        function handleLoginSuccess(user){
            onLogin();
            login.user = user || 'Anonymous';
            $log.debug('successful login ', login.user);
        }

        function showLogin(){
            console.debug('show login');
            $ionicHistory.nextViewOptions({
                disableAnimate: false,
                disableBack: true,
                historyRoot: true
            });
            $state.go('app.login');
        }

        function signin() {
            LoginService.signin(login.email, login.password)
                .then(handleLoginSuccess(login.email),  function(error) {
                    login.user = '';
                    $log.log(error)
                })
        }

        function anonymousLogin(){
            LoginService.anonymousLogin(); // doesn't really do anything, so don't have to chaing success in a promise from it refactor this is that changes
            handleLoginSuccess();
        }

        function onLogin(){
            $rootScope.$broadcast('authorized');
            $ionicHistory.nextViewOptions({
                disableAnimate: false,
                disableBack: true,
                historyRoot: true
            });
            $state.go('app.manage');
        }

        function signout() {
            $log.debug('signout');
            LoginService.signout()
                .then( function() {
                    var alertPopup = $ionicPopup.alert({
                        title: 'Logged out',
                        template: 'User: ' + login.user
                    });

                    alertPopup.then(function(res) {
                        $state.go('app.login');
                        login.user = 'Anonymous';
                        $rootScope.$broadcast('logout');
                        $state.go($state.current, {}, {reload: true});
                    });
                })

        }

        login.signin = signin;
        login.signout = signout;
        login.anonymousLogin = anonymousLogin;
        login.showLogin = showLogin;
    })    

    .controller('EditCtrl', function (SessionsModel, $stateParams, Backand, $scope, $ionicHistory, $state, $ionicPopup) {
        var edit = this;
        edit.id = $stateParams.id;
        edit.session = {};

        function fetch(id) {
            SessionsModel.fetch(id)
                .then( function(result) {
                    edit.session = result;
                    console.debug('r:', result);
                });
        }

        function update(object) {
            console.debug('update: ', object);
            SessionsModel.update(object.id, object)
                .then( function(result) {
                    $ionicHistory.goBack();
                });
        }

        $scope.$on("$ionicView.enter", function () {
            edit.fetch(edit.id);
        });

        edit.fetch = fetch;
        edit.update = update;
    })

    .controller('PollCtrl', function (SessionsModel, QuestionsModel, PollModel, AnswersModel, $stateParams, Backand, $scope, $ionicHistory, $state, $ionicPopup, $q) {
        var poll = this;
        poll.id = $stateParams.session_id;
        poll.session = {};
        poll.current_question_index = 0;
        poll.answer_index = -1;
        poll.answer_counts = {};

        Backand.on('poll_status_updated', function (data) {
            console.debug('poll status updated', data);
            poll.current_question_index = Number(data[1].Value);
            poll.answer_index = -1;
        });

        Backand.on('poll_status_created', function (data) {
            console.debug('poll status created', Number(data[1].Value));
            poll.current_question_index = Number(data[1].Value);
            poll.answer_index = -1;
        });

        function updateAnswerCount() {
            AnswersModel.all(poll.id).then( function(result) {
                console.debug('answer result:', result);
                var counts = {};
                angular.forEach(result.data.data, function(answer) {
                    //console.debug('a',answer);
                    if (!counts.hasOwnProperty(answer.question_id)){
                        counts[answer.question_id] = {};    
                    }
                    if (!counts[answer.question_id].hasOwnProperty([answer.answer])){
                        counts[answer.question_id][answer.answer] = 0
                    }
                    counts[answer.question_id][answer.answer]++;
                    //console.debug('updateD:',counts);
                });
                poll.answer_counts = counts;
            });
        };

        Backand.on('answer_created', function () {
            updateAnswerCount();
        });

        function fetch(id) {
            SessionsModel.fetch(id)
                .then( function(result) {
                    poll.session = result;
                    //console.debug('s:', result);
                });

            QuestionsModel.all(id)
                .then( function(result) {
                    poll.question = result;
                    angular.forEach(poll.question.data.data, function(item) {
                        item.answer_array = angular.fromJson(item.answers);
                    });
                    console.debug('q:', poll);
                });

            PollModel.fetch(id)
                .then( function(result) {
                    poll.session = result;
                    //console.debug('p:', result);
                });

        }

        function startOver(){
            console.debug('start over', poll.id);
            PollModel.fetch(poll.id)
                .then(function(result) {
                    //console.debug('lookup:', result);
                    var new_object = {poll_id: poll.id, poll_index: 1};
                    if(result.data.data.length == 0){ // does not exist, create                
                        console.debug('does not exist, create', new_object);
                        PollModel.create(new_object)
                            .then( function(result) {
                                // poll.session = result;
                                //console.debug('created:', result);
                            });
                    }else{
                        //console.debug('exists, update', result.data.data[0].id, new_object);
                        PollModel.update(result.data.data[0].id, new_object)
                            .then( function(updateResult) {
                                // poll.session = result;
                                var delete_requests = [];
                                
                                AnswersModel.all(poll.id).then( function(result) {
                                    angular.forEach(result.data.data, function(answer) {
                                        delete_requests.push(AnswersModel.delete(answer.id));
                                    });
                                    $q.all(delete_requests).then(function (results) {
                                        console.debug('deleted all');
                                        updateAnswerCount();
                                                   
                                        poll.current_question_index = Number(new_object.poll_index);                              
                                        console.debug('starting poll over: ', poll.current_question_index,result);
                                    });
                                });
                            });
                    }                        
            });
        }

        function answerQuestion(question_id){
            var object = {
                answer: poll.answer_index, question_id: question_id, session_id: poll.id
            };
            AnswersModel.create(object)
                .then( function(result) {
                    console.debug('answered question');      
            });
        }

        function nextQuestion(){
            PollModel.fetch(poll.id)
                .then( function(result) {
                    var pollStatus = result.data.data[0];
                    var poll_index = Number(pollStatus.poll_index);
                    console.debug('current question: ', poll_index);
                    var questionCount = poll.question.data.data.length;
                    if (questionCount < poll_index + 1){
                        console.debug('no more questions to show');
                    }else{
                        var new_object = result.data.data[0];
                        new_object.poll_index = Number(new_object.poll_index) + 1;
                        console.debug('update with:', new_object);   

                        PollModel.update(result.data.data[0].id, new_object)
                            .then( function(result) {                                
                                poll.current_question_index = Number(new_object.poll_index);                              
                                console.debug('successfully updated to: ', poll.current_question_index,result);
                        });  
                    }
            });

            // PollModel.update(poll.id, { poll_id: poll.id, poll_index: "0"})
            //     .then( (result) => {
            //         console.debug('u:', result);
            //     });
        }

        function update(object) {
            console.debug('update: ', object);
            SessionsModel.update(object.id, object)
                .then( function(result) {
                    $ionicHistory.goBack();
                });
        }

        $scope.$on("$ionicView.enter", function () {
            poll.fetch(poll.id);
            updateAnswerCount();
        });

        poll.fetch = fetch;
        poll.update = update;
        poll.startOver = startOver;
        poll.nextQuestion = nextQuestion;
        poll.answerQuestion = answerQuestion;
    })

    .controller('EditQuestionCtrl', function (QuestionsModel, $stateParams, Backand, $scope, $ionicHistory, $state, $ionicPopup) {
        var edit = this;
        edit.id = $stateParams.id;
        edit.session = {};
        function fetch(id) {
            QuestionsModel.fetch(id)
                .then( function(result) {
                    edit.question = result;
                    result.data.answer_array = angular.fromJson(result.data.answers);
                    console.debug('r:', result);
                });
        }

        function update(object) {
            object.answers = angular.toJson(object.answer_array);
            console.debug('update: ', object);
            QuestionsModel.update(object.id, object)
                .then( function(result) {
                    $ionicHistory.goBack();
                });
        }

        function addAnswer(){
            console.debug('add answer');    
            edit.answer_array.push('');
        }

        $scope.$on("$ionicView.enter", function () {
            edit.fetch(edit.id);
        });

        edit.fetch = fetch;
        edit.update = update;
        edit.addAnswer = addAnswer;
    })

    .controller('SessionCtrl', function (SessionsModel, PollModel, $rootScope, Backand, $scope, $ionicHistory, $state, $ionicPopup) {
        var session = this;

        $scope.$on("$ionicView.enter", function () {
            getAll();
        });

        function updateSessions() {
            console.debug('updating session list');
            getData()
                .then( function(result) {
                    session.data = result.data.data;
                    console.debug('r:', result)
                    $scope.$broadcast('scroll.refreshComplete');
                });
        }

        function showQuestions(session_id){
            $state.go('app.questions', {session_id: session_id});
        }

        function showPoll(session_id){
            console.debug('show poll');
            $state.go('app.run_poll', {session_id: session_id});
        }

        function joinPoll(session_id){
            console.debug('join poll');
            $state.go('app.join_poll', {session_id: session_id});
        }

        function viewPoll(session_id){
            console.debug('view poll',session_id);
            $state.go('app.view_poll', {session_id: session_id});
        }

        function showAddSession(){
            $state.go('app.add_session');
        }

        Backand.on('sessions_updated', function (data) {
            console.debug('updated',data);
            getAll();
        });

        Backand.on('sessions_deleted', function (data) {
            console.debug('deleted',data);
            getAll();
            // PollModel.delete()
            //             SessionsModel.delete(id)
            //     .then( (result) => {
            //         console.debug(result);
            //         getAll();
            //     });
        });

        Backand.on('sessions_created', function (data) {
            console.debug('created',data);
            getAll();
        });
   
        function getData(){
            // When we need to do actions after our get complete, we should return our promise, do do other actions on the data
            return SessionsModel.all();
        }

        function getAll() {
            SessionsModel.all()
                .then( function(result) {
                    session.data = result.data.data;
                });
        }

        function clearData(){
            session.data = null;
        }

        function create(object) {
            SessionsModel.create(object)
                .then( function(result) {
                    getAll();

                    var alertPopup = $ionicPopup.alert({
                        title: 'Session Created',
                        template: 'Name: ' + object.name
                    });

                    alertPopup.then( function(res) {
                        $ionicHistory.goBack();
                    });
                });
        }

        function deleteObject(id) {
            var confirmPopup = $ionicPopup.confirm({
              title: 'Delete Session?',
              template: 'This can not be undone'
            });

            confirmPopup.then(function(res) {
              if(res) {
                SessionsModel.delete(id)
                .then( function(result) {
                    console.debug(result);
                    getAll();
                });                              
              }
            });
            
        }

        function initCreateForm() {
            session.newObject = {name: '', description: ''};
        }

        function editObject(object) {
            $state.go('app.edit_session',{id: object.id});
        }

        session.objects = [];
        session.getAll = getAll;
        session.create = create;
        session.delete = deleteObject;
        session.editObject = editObject;
        session.isAuthorized = false;
        session.updateSessions = updateSessions;
        session.showAddSession = showAddSession;
        session.showQuestions = showQuestions;
        session.showPoll = showPoll;
        session.viewPoll = viewPoll;

        $rootScope.$on('authorized', function () {
            session.isAuthorized = true;
            getAll();
        });

        $rootScope.$on('logout', function () {
            clearData();
        });

        if(!session.isAuthorized){
            $rootScope.$broadcast('logout');
        }

        initCreateForm();
        getAll();
    })

    .controller('QuestionCtrl', function (QuestionsModel, $rootScope, Backand, $scope, $ionicHistory, $state, $ionicPopup, $stateParams) {
        var question = this;
        var session_id = $stateParams.session_id;

        $scope.$on("$ionicView.enter", function () {
            session_id = $stateParams.session_id;
            console.debug('session id: ', session_id);
            getAll(session_id);
            question.newObject = {question: '', session_id: session_id, answers: '', answer_array: []};
        });

        function updateQuestions() {
            console.debug('updating question list');
            getData()
                .then( function(result) {
//                    angular.forEach(result.data.data, (question) => {
//                        question.answer_array = angular.fromJson(question.answers);
//                        console.debug('set array: ', question.answer_array);
//                                            question.data = result.data.data;
//
//                    });

                console.debug('data:',question.data);
                    $scope.$broadcast('scroll.refreshComplete');
                });
        }

        function showAddQuestion(){
            console.debug('showAddQuestion');
            $state.go('app.add_question', {session_id: session_id});
        }

        Backand.on('questions_updated', function (data) {
            console.debug('questions_updated');
            getAll();
        });

        Backand.on('questions_deleted', function (data) {
            console.debug('questions_deleted');
            getAll();
        });

        Backand.on('questions_created', function (data) {
            console.debug('questions_created');
            getAll();
        });
   
        function getData(){
            return QuestionsModel.all(session_id);
        }

        function getAll() {
            QuestionsModel.all(session_id)
                .then( function(result) {
                    console.debug('got question data back: ', result);
                    question.data = result.data.data;
                    angular.forEach(question.data, function(q) {   
                        angular.forEach(result.data.data, function(question) {
                            question.answer_array = angular.fromJson(question.answers);
                        });
                        //console.debug('q:', q);
                    });
                });
        }

        function clearData(){
            question.data = null;
        }

        function create(object) {
            console.debug('object:', object);
            object.answers = angular.toJson(object.answer_array);
            
            console.debug('create question: ', object);
            QuestionsModel.create(object)
                .then( function(result) {
                    getAll();
                    var alertPopup = $ionicPopup.alert({
                        title: 'Question Created',
                        template: 'Name: ' + object.question
                    });

                    alertPopup.then(function(res) {
                        $ionicHistory.goBack();
                    });
                });
        }

        function deleteObject(id) {
            QuestionsModel.delete(id)
                .then( function(result) {
                    console.debug(result);
                    getAll();
                });
        }

        function editObject(object) {
            // todo this needs to pass session and question id's
            $state.go('app.edit_question',{id: object.id});
        }

        function buildAnswerArray(string){
            console.debug('calledo n: ', string);
            return angular.fromJson(string);
        }

        question.objects = [];
        question.getAll = getAll;
        question.create = create;
        question.delete = deleteObject;
        question.editObject = editObject;
        question.isAuthorized = false;
        question.updateQuestions = updateQuestions;
        question.showAddQuestion = showAddQuestion;
        question.buildAnswerArray = buildAnswerArray;

        $rootScope.$on('authorized', function () {
            question.isAuthorized = true;
            getAll();
        });

        $rootScope.$on('logout', function () {
            clearData();
        });

        if(!question.isAuthorized){
            $rootScope.$broadcast('logout');
        }
    });

