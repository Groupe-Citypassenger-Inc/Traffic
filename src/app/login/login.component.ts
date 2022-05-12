import { Component, OnInit, isDevMode } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../auth_services/auth.service';
import { ActivatedRoute } from '@angular/router';

export interface UserInformations {
  id: number,
  role: string,
  username: string,
}

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})

export class LoginComponent implements OnInit {
  loginFormGroup: FormGroup = this.form_builder.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });
  isLogged: boolean = this.auth.isAuth;
  userInfo: UserInformations;
  returnUrl: string;

  constructor(
    private form_builder: FormBuilder,
    private auth: AuthService,
    private route: ActivatedRoute,
  ) { }

  ngOnInit(): void {
    this.returnUrl = this.route.snapshot.queryParams.returnUrl || '/select';
    if (isDevMode()) console.log(this.returnUrl);
    this.auth.isLogged(this.returnUrl);
    this.isLogged = this.auth.isAuth;
  }

  getError(field_name): string {
    switch (field_name) {
      case 'user':
        if (this.loginFormGroup.get('username').hasError('required')) {
          return 'Username required';
        }
        break;
      case 'pass':
        if (this.loginFormGroup.get('password').hasError('required')) {
          return 'Password required';
        }
        break;
      default:
        return '';
    }
  }

  //need to disable btn when waiting server's answer.
  onSubmit(form: FormGroup): void {
    if (isDevMode()) {
      console.log(form);
    }
    let username = encodeURIComponent(form.controls.username.value);
    let password = encodeURIComponent(form.controls.password.value);
    let urlLogin = '/ws/User/Login?login=' + username + '&password=' + password;
    this.auth.login(urlLogin, this.returnUrl);
  }
}
