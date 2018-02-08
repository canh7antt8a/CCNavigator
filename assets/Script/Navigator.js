'use strict';

const logger = require('Logger').getLogger('Navigator.js');

/**
 * Navigator介绍:
 * ------------------------
 * 提供一个支持导航栈的Navigator类，支持以下特性
 * 0，记录场景切换的导航栈。
 * 1，场景之间可以传递参数，比如场景A要传个字符串给场景B。
 * 2，多个场景进入同一场景后，从场景返回前一个场景，不需要再判断前一个场景是谁，可以直接goBack返回。
 * 3，支持场景返回后页面数据恢复，比如场景A界面，输入框输入了一段文字，然后进入场景B，
 *    从场景B返回后可以恢复输入框文字(需要在场景A脚本实现固定接口支持)。
 * 4，兼容cc.director.loadScene调用，当场景切换不需要参数和保存状态时，可以直接使用cc.director.loadScene
 *    Navigator会监听并将场景加入导航栈中。（不过不推荐直接使用cc.director.loadScene，没有以上特性）
 *
 * Navigator使用方法:
 * ------------------------
 * a)在场景A向前加载新场景B[带参数][带回调]
 *   /// 默认
 *   navigator.navigate('B');
 *
 *   /// [带参数]
 *   let parameter = {};
 *   parameter.title = 'i am wang ronghui';
 *   navigator.navigate('B', parameter);
 *
 *   /// [带回调]
 *   navigator.navigate('B', function(scene){
 *      /// 切换成功处理
 *   });
 *
 *   /// [带参数] + [带回调]
 *   let parameter = {};
 *   parameter.title = 'i am wang ronghui';
 *   navigator.navigate('B', parameter, function(scene){
 *      /// 切换成功处理
 *   });
 *
 *   ~如果有传递parameter需在相应B.js内部实现loadState(parameter, state)函数接收参数parameter。
 *   ~如果要存储当前UI状态则实现saveState(state){ //将UI状态存储在参数state中,后续在loadState里恢复state }。
 *
 * c)场景B向后返回前一个场景A
 *   /// 默认
 *   navigator.goBack();
 *
 *   /// [带参数]
 *   let parameter = {};
 *   parameter.title = 'i am wang ronghui';
 *   navigator.goBack(parameter);
 *
 * d)场景B向后返回指定名字场景A
 *   /// 默认
 *   navigator.goBackToScene('A');
 *
 *   /// [带参数]
 *   let parameter = {};
 *   parameter.title = 'i am wang ronghui';
 *   navigator.goBackToScene('A', parameter);
 *
 * e)场景B向后返回根场景
 *   /// 默认
 *   navigator.goBackToRootScene();
 *
 *   /// [带参数]
 *   let parameter = {};
 *   parameter.title = 'i am wang ronghui';
 *   navigator.goBackToRootScene(parameter);
 *
 * 注意事项:
 * ------------------------
 * 挂载到场景的Canvas的自定义脚本的名字，必须要和场景文件的名字一致，否则无法调用到loadState或者saveState
 *
 */
class Navigator
{
    /**
     * 构造方法
     */
    constructor(){
        logger.debug('constructor');

        this._allState = new Map();
        this._scenesStack = [];
        this._sceneLaunchHandle = false;

        /*
        *  支持外部使用cc.director.loadScene直接导航，记录下导航栈
        */
        cc.director.on(cc.Director.EVENT_AFTER_SCENE_LAUNCH, function (eventCustom) {
            /// 内部处理了这里就忽略，这里仅为支持监听外部导航。
            if(this._sceneLaunchHandle) {
                this._sceneLaunchHandle = false;
                return;
            }

            /// 获取当前场景
            let sceneName = eventCustom.detail.name;
            logger.debug('EVENT_AFTER_SCENE_LAUNCH sceneName = ' + sceneName);

            this.handleForward(sceneName, null);
        }.bind(this));
    }

    /**
     * 向前加载sceneName场景
     * @param {string} sceneName -场景名字
     * @param {object} [parameter] -参数对象
     * @param {function()} [onSceneLaunched] -新场景运行成功后回调
     */
    navigate(sceneName, parameter, onSceneLaunched){
        logger.debug('navigate sceneName = ' + sceneName);
        logger.debug('navigate parameter = ' + parameter);
        logger.debug('navigate onSceneLaunched = ' + onSceneLaunched);

        /// 可能parameter和onSceneLaunched只传了某一个
        let argsLength = arguments.length;
        if(argsLength === 2) {
            if (typeof parameter === 'function') {
                onSceneLaunched = parameter;
                parameter = undefined;
            }
        }

        /// 先检查下导航栈有没有该场景，如果有，则回退到相应场景，防止出现场景循环
        let level = this.sceneStackLevel(sceneName);
        if(level !== -1){
            this.goBackToSceneStackLevel(level, parameter);
            return;
        }

        let readyToLeaveSceneJS = this.getCurrentSceneJS();
        if(readyToLeaveSceneJS){
            let sceneKey = 'Scene-' + this._scenesStack.length;
            let sceneState = this._allState.get(sceneKey);
            let state = {};
            sceneState.state = state;

            if(typeof readyToLeaveSceneJS.saveState === 'function'){
                readyToLeaveSceneJS.saveState(state);
            }
        }

        cc.director.loadScene(sceneName, function () {
            /// 加载新场景成功处理
            logger.debug('navigate loadScene complete sceneName = ' + sceneName);

            this._sceneLaunchHandle = true;
            this.handleForward(sceneName, parameter);

            /// 回调通知场景切换成功
            if(onSceneLaunched){
                onSceneLaunched();
            }
        }.bind(this));

        logger.debug('navigate end');
    }

    /**
     * 向后返回前一个场景
     * @param {object} [parameter] -参数对象
     */
    goBack(parameter){
        logger.debug('goBack');

        /// 当前Scene出导航栈
        this._scenesStack.pop();

        /// 加载栈顶Scene
        let sceneName = this._scenesStack[this._scenesStack.length - 1];
        cc.director.loadScene(sceneName, function () {
            logger.debug('goBack loadScene complete sceneName = ' + sceneName);

            this._sceneLaunchHandle = true;
            this.handleBack(parameter);
        }.bind(this));
    }

    /**
     * 向后返回前根场景
     * @param {object} [parameter] -参数对象
     */
    goBackToRootScene(parameter){
        logger.debug('goBackToRootScene');

        this.goBackToSceneStackLevel(1, parameter);
    }

    /**
     * 向后返回指定场景
     * @param {string} sceneName -场景名字
     * @param {object} [parameter] -参数对象
     */
    goBackToScene(sceneName, parameter){
        logger.debug('goBackToScene sceneName = ' + sceneName);

        let level = this.sceneStackLevel(sceneName);

        if(level !== -1){
            this.goBackToSceneStackLevel(level, parameter);
        }
    }


    /*-------------------------私有方法begin-------------------------*/

    /**
     * 前进页面处理，加入导航栈，分配state
     * @param {string} sceneName -场景名字
     * @param {object} [parameter] -参数对象
     */
    handleForward(sceneName, parameter){
        logger.debug('handleForward sceneName = ' + sceneName);
        logger.debug('handleForward parameter = ' + parameter);

        /// 加载新场景成功处理
        let enterSceneJS = this.getCurrentSceneJS();
        if(enterSceneJS){
            /// 向前导航时只有parameter，没有页面状态，所以页面状态为null
            if(typeof enterSceneJS.loadState === 'function'){
                enterSceneJS.loadState(parameter, null);
            }

            /// 0，入导航栈
            this._scenesStack.push(sceneName);

            /// 1，由于后退时不清理状态，在这里将当前页面以及向前所有的状态清除
            let nextSceneKey =  'Scene-' + this._scenesStack.length;
            let nextSceneIndex = this._scenesStack.length;
            while (this._allState.delete(nextSceneKey))
            {
                nextSceneIndex ++;
                nextSceneKey = 'Scene-' + nextSceneIndex;
            }

            /// 2，设置个state给当前Scene
            let sceneState = {};
            let sceneKey = 'Scene-' + this._scenesStack.length;
            logger.debug('handleForward sceneKey = ' + sceneKey);
            this._allState.set(sceneKey, sceneState);

            /// 3，记录下参数
            parameter = parameter || {};
            sceneState.parameter = parameter;
            sceneState.state = {};
        }
    }

    /**
     * 后退页面处理，恢复场景
     * @param {object} [parameter] -参数对象
     */
    handleBack(parameter){
        logger.debug('handleBack');

        /// 加载新场景成功处理
        let enterSceneJS = this.getCurrentSceneJS();
        if(enterSceneJS){
            let sceneKey = 'Scene-' + this._scenesStack.length;
            logger.debug('goBack loadScene complete sceneKey = ' + sceneKey);
            let sceneState = this._allState.get(sceneKey);

            /// 获取参数和页面状态，传入场景js,用于场景页面恢复
            if(typeof enterSceneJS.loadState === 'function'){
                /// 如果Back有带参数，优先使用参数，否则使用保留参数。
                parameter = parameter || sceneState.parameter;
                enterSceneJS.loadState(parameter, sceneState.state);
            }
        }
    }

    /**
     * 获取当前场景脚本类
     */
    getCurrentSceneJS(){
        let currentScene = cc.director.getScene();
        if(currentScene){
            let currentCanvas = currentScene.getChildByName('Canvas');
            if(currentCanvas){
                let currentCustomJS = currentCanvas.getComponent(currentScene.name);
                if(currentCustomJS){
                    return currentCustomJS;
                }
            }
        }

        return null;
    }

    /**
     * 返回到固定Level的场景
     * @param {number} level -层级，比如1代表第一层
     * @param {object} [parameter] -参数对象
     */
    goBackToSceneStackLevel(level, parameter){
        logger.debug('goBackToSceneStackLevel');

        let locScenesStack = this._scenesStack;
        let c = locScenesStack.length;

        if (c === 0) {
            return;
        }

        // current level or lower -> nothing
        if (level > c)
            return;

        // pop stack until reaching desired level
        while (c > level) {
            let current = locScenesStack.pop();
            c--;
        }

        let sceneName = locScenesStack[locScenesStack.length - 1];
        logger.debug('goBackToSceneStackLevel sceneName = ' + sceneName);

        /// 加载栈顶Scene
        cc.director.loadScene(sceneName, function () {
            logger.debug('goBack loadScene complete sceneName = ' + sceneName);

            this._sceneLaunchHandle = true;
            this.handleBack(parameter);
        }.bind(this));
    }

    /**
     * 获取指定scene名字的导航栈层级
     * @param {string} sceneName -场景名字
     */
    sceneStackLevel(sceneName){
        logger.debug('sceneStackLevel sceneName = ' + sceneName);

        let locScenesStack = this._scenesStack;

        let i = locScenesStack.length-1;
        let exist = false;
        for(; i>=0; --i){
            if(locScenesStack[i] === sceneName){
                exist = true;
                break;
            }
        }

        logger.debug('sceneStackLevel i = ' + i);

        if(exist){
            return i+1;
        }

        return -1;
    }
    /*-------------------------私有方法end-------------------------*/
}

module.exports = new Navigator();
