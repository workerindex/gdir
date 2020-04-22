import * as React from 'react';

export class LoginForm extends React.Component {
    render = () => (
        <div className="central screen-height">
            <form className="login-form central" action="/login" method="POST" autoComplete="off">
                <input name="name" type="text" placeholder="Username" autoFocus />
                <input name="pass" type="password" placeholder="Password" />
                <input type="submit" value="Login" className="button" />
            </form>
        </div>
    );
}
