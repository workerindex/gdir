import * as React from 'react';

export class LoginForm extends React.Component {
    render = () => (
        <div className="central screen-height">
            <form className="login-form central" action="/login" method="POST" autoComplete="off">
                <input id="username" name="name" type="text" placeholder="Username" autoFocus />
                <input id="password" name="pass" type="password" placeholder="Password" />
                <input type="submit" className="hidden" />
            </form>
        </div>
    );
}
