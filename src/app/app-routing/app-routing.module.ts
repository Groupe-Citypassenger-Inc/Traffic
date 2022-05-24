import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GraphComponent } from '../graph/graph.component';
import { DevicesListComponent } from '../devices-list/devices-list.component';
import { LoginComponent } from '../login/login.component';
import { GuardService } from '../auth_services/guard.service';

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'select', canActivate: [GuardService], component: DevicesListComponent },
  { path: 'graph', canActivate: [GuardService], component: GraphComponent },
  { path: 'graph/:group_name/:router/:password/:metric', canActivate: [GuardService], component: GraphComponent },
  { path: 'graph/:group_name/:router/:password/:box_name/:metric', canActivate: [GuardService], component: GraphComponent },
  { path: '', redirectTo: '/login', pathMatch: 'full' },  // Wildcard route for a 404 page
  { path: '**', redirectTo: '/login', pathMatch: 'full' },  // Wildcard route for a 404 page
]; // sets up routes constant where you define your routes

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})

export class AppRoutingModule { }
export const routingComponents = [LoginComponent, DevicesListComponent, GraphComponent];
