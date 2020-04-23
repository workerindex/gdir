import * as React from 'react';
import { BrowserRouter, Switch, Route } from 'react-router-dom';

import { getCookies } from './utils';
import { FileList } from './FileList';
import { LoginForm } from './LoginForm';

const Home = () => {
    const cookies = getCookies();
    if (typeof cookies['t'] === 'string' && cookies['t'] !== '') {
        return <FileList />;
    } else {
        return <LoginForm />;
    }
};

export default class App extends React.Component {
    render = () => (
        <BrowserRouter>
            <Switch>
                <Route exact path="/">
                    <Home />
                </Route>
                <Route path="/folder/:folderID">
                    <FileList />
                </Route>
            </Switch>
        </BrowserRouter>
    );
}
