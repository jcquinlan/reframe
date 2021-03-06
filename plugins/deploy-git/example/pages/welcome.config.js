import React from 'react';

const WelcomePage = {
    route: '/',
    view: () => (
        <div>
            Welcome to Reframe.
            <br/><br/>
            <small>
                Built at {new Date().toString()}
            </small>
        </div>
    ),
    htmlStatic: true,
    domStatic: true,
};

export default WelcomePage;
